import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';
import { assertSafeTestDatabase } from '../src/lib/test-database.js';
import { connectMongo, disconnectMongo, isMongoReady } from '../src/lib/mongodb.js';
import { Application } from '../src/models/application.js';
import { ApplicantProfile } from '../src/models/applicant-profile.js';
import { Job } from '../src/models/job.js';
import { FakeResumeStorageProvider } from './helpers/fake-resume-storage.js';

const enabled = process.env.RUN_MONGODB_TESTS === '1';
const describeIntegration = enabled ? describe : describe.skip;
const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000, MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/job_board_phase7_test',
  WEB_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters', ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web', ACCESS_TOKEN_TTL_SECONDS: 600, REFRESH_TOKEN_TTL_DAYS: 7,
};
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const jobInput = { title: 'Platform Engineer', description: 'Build reliable platform systems with a collaborative engineering team.', requirements: ['Production engineering experience'], skills: ['TypeScript'], location: { city: 'Bengaluru', country: 'India' }, workMode: 'HYBRID', employmentType: 'FULL_TIME' };

function makeApp(storage: FakeResumeStorageProvider) { return createApp({ environment, logger: createLogger(environment), isDatabaseReady: isMongoReady, resumeStorageProvider: storage }); }
type TestApp = ReturnType<typeof makeApp>;

async function register(app: TestApp, email: string, role: 'APPLICANT' | 'EMPLOYER'): Promise<string> {
  return (await request(app).post('/api/v1/auth/register').send({ email, password: 'correct horse battery staple', role }).expect(201)).body.accessToken as string;
}
async function prepareApplicant(app: TestApp, email: string): Promise<string> {
  const token = await register(app, email, 'APPLICANT');
  await request(app).post('/api/v1/applicant/profile').set('authorization', `Bearer ${token}`).send({ fullName: 'Ada Lovelace', location: { city: 'London', country: 'United Kingdom' } }).expect(201);
  await request(app).put('/api/v1/applicant/resume').set('authorization', `Bearer ${token}`).attach('resume', pdf, { filename: 'resume.pdf', contentType: 'application/pdf' }).expect(200);
  return token;
}
async function createJob(app: TestApp, suffix: string, publish = true): Promise<{ id: string; employerToken: string }> {
  const employerToken = await register(app, `employer-${suffix}@example.test`, 'EMPLOYER');
  await request(app).post('/api/v1/employer/company').set('authorization', `Bearer ${employerToken}`).send({ name: `Acme ${suffix}`, location: { city: 'Bengaluru', country: 'India' } }).expect(201);
  const created = await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${employerToken}`).send({ ...jobInput, title: `${jobInput.title} ${suffix}` }).expect(201);
  if (publish) await request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/publish`).set('authorization', `Bearer ${employerToken}`).expect(200);
  return { id: created.body.job.id as string, employerToken };
}
function apply(app: TestApp, token: string, jobId: string, body: object = {}) { return request(app).post(`/api/v1/jobs/${jobId}/applications`).set('authorization', `Bearer ${token}`).send(body); }

describeIntegration('applicant application workflow', () => {
  beforeAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await connectMongo(environment.MONGODB_URI, createLogger(environment)); });
  beforeEach(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await Application.syncIndexes(); });
  afterAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await disconnectMongo(); });

  it('requires authentication, the Applicant role, a profile, and a current resume', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const job = await createJob(app, 'requirements');
    await request(app).post(`/api/v1/jobs/${job.id}/applications`).send({}).expect(401);
    await apply(app, job.employerToken, job.id).expect(403);
    const applicant = await register(app, 'missing-profile@example.test', 'APPLICANT');
    await apply(app, applicant, job.id).expect(409).expect(({ body }) => expect(body.error.code).toBe('APPLICANT_PROFILE_REQUIRED'));
    await request(app).post('/api/v1/applicant/profile').set('authorization', `Bearer ${applicant}`).send({ fullName: 'No Resume', location: { city: 'London', country: 'UK' } }).expect(201);
    await apply(app, applicant, job.id).expect(409).expect(({ body }) => expect(body.error.code).toBe('RESUME_REQUIRED'));
  });

  it('submits one application with an independent private snapshot and prevents duplicate races', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const job = await createJob(app, 'race'); const applicant = await prepareApplicant(app, 'race@example.test');
    const [first, second] = await Promise.all([apply(app, applicant, job.id, { coverLetter: 'Please consider my application.' }), apply(app, applicant, job.id, { coverLetter: 'Please consider my application.' })]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const success = first.status === 201 ? first : second;
    expect(success.body.application).toMatchObject({ status: 'SUBMITTED', resumeSnapshot: { originalFilename: 'resume.pdf' } });
    expect(success.body.application.resumeSnapshot).not.toHaveProperty('assetId');
    expect(await Application.countDocuments()).toBe(1);
    expect(storage.snapshots).toHaveLength(1);
    expect(storage.snapshotSources).toEqual(['private/resume-1']);
    expect(storage.snapshots[0]).not.toBe(storage.snapshotSources[0]);
    await apply(app, applicant, job.id, { status: 'SUBMITTED', applicantUserId: 'attacker' }).expect(400);
  });

  it('rejects unavailable Jobs without leaking drafts and rejects expired deadlines', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const applicant = await prepareApplicant(app, 'eligibility@example.test');
    const draft = await createJob(app, 'draft', false);
    await apply(app, applicant, draft.id).expect(404);
    await request(app).post(`/api/v1/employer/jobs/${draft.id}/publish`).set('authorization', `Bearer ${draft.employerToken}`).expect(200);
    await request(app).post(`/api/v1/employer/jobs/${draft.id}/close`).set('authorization', `Bearer ${draft.employerToken}`).expect(200);
    await apply(app, applicant, draft.id).expect(404);
    await request(app).post(`/api/v1/employer/jobs/${draft.id}/archive`).set('authorization', `Bearer ${draft.employerToken}`).expect(200);
    await apply(app, applicant, draft.id).expect(404);
    const source = await Job.findOne({ _id: draft.id }).lean();
    const expired = await Job.create({ ...jobInput, title: 'Expired role', slug: 'expired-role-phase7', companyId: source!.companyId, createdBy: source!.createdBy, status: 'PUBLISHED', publishedAt: new Date(Date.now() - 60_000), applicationDeadline: new Date(Date.now() - 1_000) });
    await apply(app, applicant, expired._id.toString()).expect(409).expect(({ body }) => expect(body.error.code).toBe('JOB_NOT_ACCEPTING_APPLICATIONS'));
    await apply(app, applicant, '507f1f77bcf86cd799439011').expect(404);
  });

  it('keeps the snapshot when the mutable current resume is replaced or deleted', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const job = await createJob(app, 'snapshot'); const applicant = await prepareApplicant(app, 'snapshot@example.test');
    const submitted = await apply(app, applicant, job.id).expect(201); const applicationId = submitted.body.application.id as string;
    const stored = await Application.findById(applicationId).lean(); const originalSnapshot = stored!.resumeSnapshot!;
    await request(app).put('/api/v1/applicant/resume').set('authorization', `Bearer ${applicant}`).attach('resume', Buffer.from('%PDF-1.7\nreplacement\n%%EOF'), { filename: 'replacement.pdf', contentType: 'application/pdf' }).expect(200);
    await request(app).delete('/api/v1/applicant/resume').set('authorization', `Bearer ${applicant}`).expect(204);
    const after = await Application.findById(applicationId).lean();
    expect(after!.resumeSnapshot).toMatchObject({ assetId: originalSnapshot.assetId, originalFilename: 'resume.pdf' });
    expect(JSON.stringify(after!.resumeSnapshot)).not.toContain('%PDF');
    expect(storage.deleted).toEqual(expect.arrayContaining(['private/resume-1', 'private/resume-2']));
    expect(storage.deleted).not.toContain(originalSnapshot.assetId);
  });

  it('lists and reads only owned applications, then atomically withdraws without deleting its snapshot', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const firstJob = await createJob(app, 'list-one'); const secondJob = await createJob(app, 'list-two');
    const owner = await prepareApplicant(app, 'owner-applications@example.test'); const other = await prepareApplicant(app, 'other-applications@example.test');
    const first = await apply(app, owner, firstJob.id, { coverLetter: 'First cover letter.' }).expect(201);
    await apply(app, owner, secondJob.id).expect(201); await apply(app, other, firstJob.id).expect(201);
    const list = await request(app).get('/api/v1/applicant/applications?page=1&limit=1').set('authorization', `Bearer ${owner}`).expect(200);
    expect(list.body).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(list.body.applications[0].job.company).not.toHaveProperty('ownerUserId');
    await request(app).get(`/api/v1/applicant/applications/${first.body.application.id}`).set('authorization', `Bearer ${other}`).expect(404);
    await request(app).get(`/api/v1/applicant/applications/${first.body.application.id}`).set('authorization', `Bearer ${firstJob.employerToken}`).expect(403);
    await request(app).get('/api/v1/applicant/applications?status[$ne]=SUBMITTED').set('authorization', `Bearer ${owner}`).expect(400);
    await request(app).get('/api/v1/applicant/applications?page=0').set('authorization', `Bearer ${owner}`).expect(400);
    const withdrawn = await request(app).post(`/api/v1/applicant/applications/${first.body.application.id}/withdraw`).set('authorization', `Bearer ${owner}`).send({ status: 'SUBMITTED' }).expect(200);
    expect(withdrawn.body.application).toMatchObject({ status: 'WITHDRAWN', withdrawnAt: expect.any(String) });
    await request(app).post(`/api/v1/applicant/applications/${first.body.application.id}/withdraw`).set('authorization', `Bearer ${owner}`).expect(409);
    await request(app).post(`/api/v1/applicant/applications/${first.body.application.id}/withdraw`).set('authorization', `Bearer ${other}`).expect(404);
    const persisted = await Application.findById(first.body.application.id).lean();
    expect(persisted).toMatchObject({ status: 'WITHDRAWN' }); expect(persisted?.resumeSnapshot).toBeDefined();
    await apply(app, owner, firstJob.id).expect(409).expect(({ body }) => expect(body.error.code).toBe('APPLICATION_ALREADY_EXISTS'));
  });

  it('compensates provider and finalization failures without deleting the current resume', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const job = await createJob(app, 'failures'); const applicant = await prepareApplicant(app, 'failures@example.test');
    storage.failSnapshot = true;
    await apply(app, applicant, job.id).expect(503).expect(({ body }) => expect(body.error.code).toBe('RESUME_SNAPSHOT_ERROR'));
    expect(await Application.countDocuments()).toBe(0); expect((await ApplicantProfile.findOne().lean())?.resume).toBeDefined();
    storage.failSnapshot = false;
    const spy = vi.spyOn(Application, 'findOneAndUpdate').mockReturnValue({ lean: async () => { throw new Error('simulated finalization failure'); } } as never);
    storage.failDelete = true;
    await apply(app, applicant, job.id).expect(500);
    spy.mockRestore(); storage.failDelete = false;
    expect(await Application.countDocuments()).toBe(0);
    expect(storage.deleteAttempts).toEqual(expect.arrayContaining(['private/application-resume-1']));
    expect((await ApplicantProfile.findOne().lean())?.resume).toBeDefined();
  });
});
