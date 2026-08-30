import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';
import { assertSafeTestDatabase } from '../src/lib/test-database.js';
import { connectMongo, disconnectMongo, isMongoReady } from '../src/lib/mongodb.js';
import { Application } from '../src/models/application.js';
import { SavedJob } from '../src/models/saved-job.js';
import { Job } from '../src/models/job.js';
import { FakeResumeStorageProvider } from './helpers/fake-resume-storage.js';

const enabled = process.env.RUN_MONGODB_TESTS === '1';
const describeIntegration = enabled ? describe : describe.skip;
const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000, MONGODB_URI: 'mongodb://127.0.0.1:27017/job_board_phase9_test',
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

function makeApp(storage: FakeResumeStorageProvider) { return createApp({ environment, logger: createLogger(environment), isDatabaseReady: isMongoReady, resumeStorageProvider: storage }); }
type TestApp = ReturnType<typeof makeApp>;

async function register(app: TestApp, email: string, role: 'APPLICANT' | 'EMPLOYER') {
  const response = await request(app).post('/api/v1/auth/register').send({ email, password: 'correct horse battery staple', role }).expect(201);
  return response.body.accessToken as string;
}
async function prepareApplicant(app: TestApp, email: string) {
  const token = await register(app, email, 'APPLICANT');
  await request(app).post('/api/v1/applicant/profile').set('authorization', `Bearer ${token}`).send({ fullName: 'Ada Lovelace', headline: 'Backend Engineer', location: { city: 'London', country: 'United Kingdom' }, skills: ['TypeScript'] }).expect(201);
  await request(app).put('/api/v1/applicant/resume').set('authorization', `Bearer ${token}`).attach('resume', pdf, { filename: 'ada-resume.pdf', contentType: 'application/pdf' }).expect(200);
  return token;
}
async function createEmployer(app: TestApp, suffix: string) {
  const token = await register(app, `employer-${suffix}@example.test`, 'EMPLOYER');
  await request(app).post('/api/v1/employer/company').set('authorization', `Bearer ${token}`).send({ name: `Acme ${suffix}`, location: { city: 'Bengaluru', country: 'India' } }).expect(201);
  return token;
}
async function createJob(app: TestApp, employerToken: string, suffix: string, options: { publish?: boolean; salary?: object; deadline?: string } = {}) {
  const created = await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${employerToken}`).send({ ...jobInput, title: `${jobInput.title} ${suffix}`, ...(options.salary ? { salary: options.salary } : {}), ...(options.deadline ? { applicationDeadline: options.deadline } : {}) }).expect(201);
  if (options.publish !== false) await request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/publish`).set('authorization', `Bearer ${employerToken}`).expect(200);
  return created.body.job.id as string;
}
function save(app: TestApp, token: string, jobId: string) { return request(app).post(`/api/v1/applicant/saved-jobs/${jobId}`).set('authorization', `Bearer ${token}`).send({}); }
function apply(app: TestApp, token: string, jobId: string) { return request(app).post(`/api/v1/jobs/${jobId}/applications`).set('authorization', `Bearer ${token}`).send({}); }

describeIntegration('saved Jobs and Applicant dashboard', () => {
  beforeAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await connectMongo(environment.MONGODB_URI, createLogger(environment)); });
  beforeEach(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await Application.syncIndexes(); await SavedJob.syncIndexes(); });
  afterAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await disconnectMongo(); });

  it('keeps the SavedJob record minimal and enforces its database unique invariant', async () => {
    const applicantUserId = new Types.ObjectId(); const jobId = new Types.ObjectId();
    const saved = await SavedJob.create({ applicantUserId, jobId });
    expect(saved.toObject()).toMatchObject({ applicantUserId, jobId, createdAt: expect.any(Date), updatedAt: expect.any(Date) });
    expect(saved.toObject()).not.toHaveProperty('notes');
    await expect(SavedJob.create({ applicantUserId, jobId })).rejects.toMatchObject({ code: 11000 });
    await expect(SavedJob.create({ jobId })).rejects.toThrow();
  });

  it('saves only active Jobs, protects the route by role, and handles duplicate saves idempotently', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const employer = await createEmployer(app, 'save');
    const active = await createJob(app, employer, 'active'); const draft = await createJob(app, employer, 'draft', { publish: false });
    const closed = await createJob(app, employer, 'closed'); await request(app).post(`/api/v1/employer/jobs/${closed}/close`).set('authorization', `Bearer ${employer}`).expect(200);
    const archived = await createJob(app, employer, 'archived', { publish: false }); await request(app).post(`/api/v1/employer/jobs/${archived}/archive`).set('authorization', `Bearer ${employer}`).expect(200);
    const expired = await createJob(app, employer, 'expired', { deadline: new Date(Date.now() + 60_000).toISOString() });
    await Job.updateOne({ _id: expired }, { $set: { applicationDeadline: new Date(Date.now() - 1_000) } });
    const applicant = await prepareApplicant(app, 'save@example.test');
    await request(app).post(`/api/v1/applicant/saved-jobs/${active}`).send({}).expect(401);
    await save(app, employer, active).expect(403);
    await save(app, applicant, 'invalid').expect(400);
    await save(app, applicant, '507f1f77bcf86cd799439011').expect(404);
    await save(app, applicant, draft).expect(404); await save(app, applicant, closed).expect(404); await save(app, applicant, archived).expect(404); await save(app, applicant, expired).expect(404);
    await request(app).post(`/api/v1/applicant/saved-jobs/${active}`).set('authorization', `Bearer ${applicant}`).send({ applicantUserId: 'attacker' }).expect(400);
    await save(app, applicant, active).expect(201).expect(({ body }) => expect(body).toMatchObject({ created: true }));
    await save(app, applicant, active).expect(200).expect(({ body }) => expect(body).toMatchObject({ created: false }));
    const [first, second] = await Promise.all([save(app, applicant, active), save(app, applicant, active)]);
    expect([first.status, second.status].sort()).toEqual([200, 200]);
    expect(await SavedJob.countDocuments()).toBe(1);
  });

  it('keeps saved Jobs private, paginated, public-safe, and historically inactive after closure', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const employer = await createEmployer(app, 'list');
    const first = await createJob(app, employer, 'first', { salary: { min: 10, max: 20, currency: 'USD', period: 'HOUR', visible: false } });
    const second = await createJob(app, employer, 'second'); const owner = await prepareApplicant(app, 'list-owner@example.test'); const other = await prepareApplicant(app, 'list-other@example.test');
    await save(app, owner, first).expect(201); await save(app, owner, second).expect(201); await save(app, other, first).expect(201);
    await request(app).get('/api/v1/applicant/saved-jobs').set('authorization', `Bearer ${employer}`).expect(403);
    const list = await request(app).get('/api/v1/applicant/saved-jobs?page=1&limit=1').set('authorization', `Bearer ${owner}`).expect(200);
    expect(list.body).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(list.body.savedJobs[0].job).not.toHaveProperty('createdBy');
    expect(list.body.savedJobs[0].job).not.toHaveProperty('salary');
    expect(list.body.savedJobs[0].job.company).not.toHaveProperty('ownerUserId');
    await request(app).get('/api/v1/applicant/saved-jobs?page[$ne]=1').set('authorization', `Bearer ${owner}`).expect(400);
    await request(app).get('/api/v1/applicant/saved-jobs?limit[$gt]=1').set('authorization', `Bearer ${owner}`).expect(400);
    await request(app).get('/api/v1/applicant/saved-jobs?active[$ne]=true').set('authorization', `Bearer ${owner}`).expect(400);
    await request(app).get('/api/v1/applicant/saved-jobs?page=0').set('authorization', `Bearer ${owner}`).expect(400);
    await request(app).get('/api/v1/applicant/saved-jobs?limit=999999').set('authorization', `Bearer ${owner}`).expect(400);
    await request(app).post(`/api/v1/employer/jobs/${second}/close`).set('authorization', `Bearer ${employer}`).expect(200);
    const inactive = await request(app).get('/api/v1/applicant/saved-jobs?limit=20').set('authorization', `Bearer ${owner}`).expect(200);
    expect(inactive.body.savedJobs.find((item: { job: { id: string } | null }) => item.job?.id === second)).toMatchObject({ isActive: false, availability: 'CLOSED' });
    expect(await SavedJob.countDocuments({ applicantUserId: { $ne: null } })).toBe(3);
  });

  it('keeps saving, unsaving, and applying independent', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const employer = await createEmployer(app, 'independent');
    const job = await createJob(app, employer, 'independent'); const applicant = await prepareApplicant(app, 'independent@example.test');
    await save(app, applicant, job).expect(201); await apply(app, applicant, job).expect(201);
    const otherApplicant = await prepareApplicant(app, 'independent-other@example.test'); await save(app, otherApplicant, job).expect(201);
    await request(app).delete(`/api/v1/applicant/saved-jobs/${job}`).set('authorization', `Bearer ${applicant}`).expect(204);
    await request(app).delete(`/api/v1/applicant/saved-jobs/${job}`).set('authorization', `Bearer ${applicant}`).expect(204);
    expect(await SavedJob.countDocuments({ jobId: job })).toBe(1); expect(await Application.countDocuments()).toBe(1);
    const unsavedApplicationJob = await createJob(app, employer, 'apply-without-save');
    await apply(app, applicant, unsavedApplicationJob).expect(201); expect(await SavedJob.countDocuments({ jobId: unsavedApplicationJob })).toBe(0);
  });

  it('derives a bounded private dashboard from current profile, resume, Applications, and Saved Jobs', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const employer = await createEmployer(app, 'dashboard');
    const missingProfile = await register(app, 'dashboard-missing@example.test', 'APPLICANT');
    await request(app).get('/api/v1/applicant/dashboard').expect(401);
    await request(app).get('/api/v1/applicant/dashboard').set('authorization', `Bearer ${employer}`).expect(403);
    await request(app).get('/api/v1/applicant/dashboard?userId=attacker').set('authorization', `Bearer ${missingProfile}`).expect(400);
    await request(app).get('/api/v1/applicant/dashboard').set('authorization', `Bearer ${missingProfile}`).expect(200).expect(({ body }) => expect(body).toMatchObject({ profile: { exists: false }, resume: { exists: false }, applications: { total: 0 }, savedJobs: { total: 0 } }));

    const applicant = await prepareApplicant(app, 'dashboard@example.test'); const jobs = [] as string[];
    for (let index = 0; index < 6; index += 1) jobs.push(await createJob(app, employer, `dashboard-${index}`));
    await Promise.all(jobs.map((job) => save(app, applicant, job)));
    const firstApplication = await apply(app, applicant, jobs[0]).expect(201);
    await apply(app, applicant, jobs[1]).expect(201);
    await request(app).patch(`/api/v1/employer/applications/${firstApplication.body.application.id}/status`).set('authorization', `Bearer ${employer}`).send({ status: 'UNDER_REVIEW' }).expect(200);
    const dashboard = await request(app).get('/api/v1/applicant/dashboard').set('authorization', `Bearer ${applicant}`).expect(200);
    expect(dashboard.body).toMatchObject({
      profile: { exists: true, fullName: 'Ada Lovelace', headline: 'Backend Engineer' },
      resume: { exists: true, originalFilename: 'ada-resume.pdf' },
      applications: { total: 2, byStatus: { SUBMITTED: 1, UNDER_REVIEW: 1, HIRED: 0, REJECTED: 0, WITHDRAWN: 0 } },
      savedJobs: { total: 6 },
    });
    expect(dashboard.body.applications.recent).toHaveLength(2); expect(dashboard.body.savedJobs.recent).toHaveLength(5);
    expect(JSON.stringify(dashboard.body)).not.toContain('assetId'); expect(JSON.stringify(dashboard.body)).not.toContain('accessUrl');
    const otherApplicant = await prepareApplicant(app, 'dashboard-other@example.test');
    await request(app).get('/api/v1/applicant/dashboard').set('authorization', `Bearer ${otherApplicant}`).expect(200).expect(({ body }) => expect(body).toMatchObject({ applications: { total: 0 }, savedJobs: { total: 0 } }));
  });
});
