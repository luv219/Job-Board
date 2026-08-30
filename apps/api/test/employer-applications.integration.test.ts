import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';
import { assertSafeTestDatabase } from '../src/lib/test-database.js';
import { connectMongo, disconnectMongo, isMongoReady } from '../src/lib/mongodb.js';
import { Application } from '../src/models/application.js';
import { FakeResumeStorageProvider } from './helpers/fake-resume-storage.js';

const enabled = process.env.RUN_MONGODB_TESTS === '1';
const describeIntegration = enabled ? describe : describe.skip;
const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000, MONGODB_URI: 'mongodb://127.0.0.1:27017/job_board_phase8_test',
  WEB_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters', ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web', ACCESS_TOKEN_TTL_SECONDS: 600, REFRESH_TOKEN_TTL_DAYS: 7,
};
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const jobInput = {
  title: 'Platform Engineer', description: 'Build reliable platform systems with a collaborative engineering team.',
  requirements: ['Production engineering experience'], skills: ['TypeScript'],
  location: { city: 'Bengaluru', country: 'India' }, workMode: 'HYBRID', employmentType: 'FULL_TIME',
};

function makeApp(storage: FakeResumeStorageProvider) {
  return createApp({ environment, logger: createLogger(environment), isDatabaseReady: isMongoReady, resumeStorageProvider: storage });
}
type TestApp = ReturnType<typeof makeApp>;

async function register(app: TestApp, email: string, role: 'APPLICANT' | 'EMPLOYER'): Promise<string> {
  const response = await request(app).post('/api/v1/auth/register').send({ email, password: 'correct horse battery staple', role }).expect(201);
  return response.body.accessToken as string;
}

async function prepareApplicant(app: TestApp, email: string, fullName = 'Ada Lovelace'): Promise<string> {
  const token = await register(app, email, 'APPLICANT');
  await request(app).post('/api/v1/applicant/profile').set('authorization', `Bearer ${token}`).send({
    fullName, headline: 'Systems engineer', bio: 'Private candidate details for the employer detail view.',
    location: { city: 'London', country: 'United Kingdom' }, skills: ['TypeScript', 'Node.js'],
    experience: [{ title: 'Engineer', companyName: 'Analytical Engines', startDate: '2022-01-01', isCurrent: true }],
    education: [{ institution: 'University of London', degree: 'BSc' }],
  }).expect(201);
  await request(app).put('/api/v1/applicant/resume').set('authorization', `Bearer ${token}`).attach('resume', pdf, { filename: 'ada-resume.pdf', contentType: 'application/pdf' }).expect(200);
  return token;
}

async function createJob(app: TestApp, suffix: string): Promise<{ id: string; employerToken: string }> {
  const employerToken = await register(app, `employer-${suffix}@example.test`, 'EMPLOYER');
  await request(app).post('/api/v1/employer/company').set('authorization', `Bearer ${employerToken}`).send({ name: `Acme ${suffix}`, location: { city: 'Bengaluru', country: 'India' } }).expect(201);
  const created = await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${employerToken}`).send({ ...jobInput, title: `${jobInput.title} ${suffix}` }).expect(201);
  await request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/publish`).set('authorization', `Bearer ${employerToken}`).expect(200);
  return { id: created.body.job.id as string, employerToken };
}

async function submit(app: TestApp, applicantToken: string, jobId: string): Promise<string> {
  const response = await request(app).post(`/api/v1/jobs/${jobId}/applications`).set('authorization', `Bearer ${applicantToken}`).send({ coverLetter: 'I would be delighted to discuss this role.' }).expect(201);
  return response.body.application.id as string;
}

function statusRequest(app: TestApp, employerToken: string, applicationId: string, status: string) {
  return request(app).patch(`/api/v1/employer/applications/${applicationId}/status`).set('authorization', `Bearer ${employerToken}`).send({ status });
}

describeIntegration('employer application review workflow', () => {
  beforeAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await connectMongo(environment.MONGODB_URI, createLogger(environment)); });
  beforeEach(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await Application.syncIndexes(); });
  afterAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await disconnectMongo(); });

  it('enforces Employer role and company-job ownership for review endpoints', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage);
    const ownerJob = await createJob(app, 'owner'); const otherJob = await createJob(app, 'other');
    const applicant = await prepareApplicant(app, 'candidate-owner@example.test'); const applicationId = await submit(app, applicant, ownerJob.id);

    await request(app).get(`/api/v1/employer/jobs/${ownerJob.id}/applications`).expect(401);
    await request(app).get(`/api/v1/employer/jobs/${ownerJob.id}/applications`).set('authorization', `Bearer ${applicant}`).expect(403);
    await request(app).get(`/api/v1/employer/jobs/${ownerJob.id}/applications`).set('authorization', `Bearer ${ownerJob.employerToken}`).expect(200).expect(({ body }) => {
      expect(body).toMatchObject({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(body.applications[0]).toMatchObject({ id: applicationId, status: 'SUBMITTED', applicant: { fullName: 'Ada Lovelace', headline: 'Systems engineer', skills: ['TypeScript', 'Node.js'] }, resumeSnapshot: { originalFilename: 'ada-resume.pdf' } });
      expect(body.applications[0].applicant).not.toHaveProperty('email');
      expect(body.applications[0].resumeSnapshot).not.toHaveProperty('assetId');
    });
    await request(app).get(`/api/v1/employer/jobs/${ownerJob.id}/applications?status=SUBMITTED&page=1&limit=1`).set('authorization', `Bearer ${ownerJob.employerToken}`).expect(200);
    await request(app).get(`/api/v1/employer/jobs/${ownerJob.id}/applications?status[$ne]=SUBMITTED`).set('authorization', `Bearer ${ownerJob.employerToken}`).expect(400);
    await request(app).get(`/api/v1/employer/jobs/${ownerJob.id}/applications`).set('authorization', `Bearer ${otherJob.employerToken}`).expect(404);
    await request(app).get(`/api/v1/employer/applications/${applicationId}`).set('authorization', `Bearer ${otherJob.employerToken}`).expect(404);
    await statusRequest(app, otherJob.employerToken, applicationId, 'UNDER_REVIEW').expect(404);
    await request(app).post(`/api/v1/employer/applications/${applicationId}/resume/access`).set('authorization', `Bearer ${otherJob.employerToken}`).expect(404);
  });

  it('returns a safe detail and grants only snapshot-specific, no-store resume access', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const job = await createJob(app, 'resume');
    const applicant = await prepareApplicant(app, 'candidate-resume@example.test'); const applicationId = await submit(app, applicant, job.id);
    const detail = await request(app).get(`/api/v1/employer/applications/${applicationId}`).set('authorization', `Bearer ${job.employerToken}`).expect(200);
    expect(detail.body.application).toMatchObject({ applicant: { fullName: 'Ada Lovelace', bio: 'Private candidate details for the employer detail view.', experience: [{ title: 'Engineer' }] }, job: { id: job.id }, resumeSnapshot: { originalFilename: 'ada-resume.pdf' } });
    expect(detail.body.application.applicant).not.toHaveProperty('email');
    expect(detail.body.application.resumeSnapshot).not.toHaveProperty('assetId');
    const access = await request(app).post(`/api/v1/employer/applications/${applicationId}/resume/access`).set('authorization', `Bearer ${job.employerToken}`).expect(200);
    expect(access.headers['cache-control']).toBe('private, no-store');
    expect(access.body).toMatchObject({ accessUrl: expect.stringContaining('application-resume-1'), expiresAt: expect.any(String) });
    expect(access.body).not.toHaveProperty('assetId');
    expect(access.body.accessUrl).not.toContain('private/private/resume-1?');
    await request(app).post(`/api/v1/applicant/applications/${applicationId}/withdraw`).set('authorization', `Bearer ${applicant}`).expect(200);
    await request(app).post(`/api/v1/employer/applications/${applicationId}/resume/access`).set('authorization', `Bearer ${job.employerToken}`).expect(200);
  });

  it('allows only the explicit employer pipeline and exposes resulting statuses to applicants', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const job = await createJob(app, 'pipeline');
    const applicant = await prepareApplicant(app, 'candidate-pipeline@example.test'); const applicationId = await submit(app, applicant, job.id);
    await statusRequest(app, job.employerToken, applicationId, 'HIRED').expect(409).expect(({ body }) => expect(body.error.code).toBe('APPLICATION_INVALID_TRANSITION'));
    await request(app).patch(`/api/v1/employer/applications/${applicationId}/status`).set('authorization', `Bearer ${job.employerToken}`).send({ status: 'UNDER_REVIEW', applicantUserId: 'attacker' }).expect(400);
    for (const status of ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED']) {
      await statusRequest(app, job.employerToken, applicationId, status).expect(200).expect(({ body }) => expect(body.application.status).toBe(status));
    }
    await request(app).get(`/api/v1/applicant/applications/${applicationId}`).set('authorization', `Bearer ${applicant}`).expect(200).expect(({ body }) => expect(body.application.status).toBe('HIRED'));
    await statusRequest(app, job.employerToken, applicationId, 'REJECTED').expect(409).expect(({ body }) => expect(body.error.code).toBe('APPLICATION_INVALID_TRANSITION'));
    await request(app).post(`/api/v1/applicant/applications/${applicationId}/withdraw`).set('authorization', `Bearer ${applicant}`).expect(409).expect(({ body }) => expect(body.error.code).toBe('APPLICATION_NOT_WITHDRAWABLE'));
  });

  it('allows an applicant to withdraw from an active employer state and uses conditional updates for races', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const job = await createJob(app, 'withdrawal');
    const applicant = await prepareApplicant(app, 'candidate-withdrawal@example.test'); const applicationId = await submit(app, applicant, job.id);
    await statusRequest(app, job.employerToken, applicationId, 'UNDER_REVIEW').expect(200);
    await request(app).post(`/api/v1/applicant/applications/${applicationId}/withdraw`).set('authorization', `Bearer ${applicant}`).expect(200).expect(({ body }) => expect(body.application.status).toBe('WITHDRAWN'));
    await statusRequest(app, job.employerToken, applicationId, 'SHORTLISTED').expect(409).expect(({ body }) => expect(body.error.code).toBe('APPLICATION_INVALID_TRANSITION'));

    const competingApplicationId = await submit(app, await prepareApplicant(app, 'candidate-race@example.test'), job.id);
    const [reviewed, withdrawn] = await Promise.all([
      Application.findOneAndUpdate({ _id: competingApplicationId, status: 'SUBMITTED' }, { $set: { status: 'UNDER_REVIEW' } }, { returnDocument: 'after' }).lean(),
      Application.findOneAndUpdate({ _id: competingApplicationId, status: 'SUBMITTED' }, { $set: { status: 'WITHDRAWN', withdrawnAt: new Date() } }, { returnDocument: 'after' }).lean(),
    ]);
    expect([reviewed, withdrawn].filter(Boolean)).toHaveLength(1);
    expect((await Application.findById(competingApplicationId).lean())?.status).toMatch(/^(UNDER_REVIEW|WITHDRAWN)$/);
  });
});
