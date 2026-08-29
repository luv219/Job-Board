import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';
import { assertSafeTestDatabase } from '../src/lib/test-database.js';
import { connectMongo, disconnectMongo, isMongoReady } from '../src/lib/mongodb.js';
import { User } from '../src/models/user.js';
import { AuthSession } from '../src/models/auth-session.js';
import { Company } from '../src/models/company.js';
import { Job } from '../src/models/job.js';

const enabled = process.env.RUN_MONGODB_TESTS === '1';
const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000, MONGODB_URI: 'mongodb://127.0.0.1:27017/job_board_phase4_test',
  WEB_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters', ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web', ACCESS_TOKEN_TTL_SECONDS: 600, REFRESH_TOKEN_TTL_DAYS: 7,
};

const app = createApp({ environment, logger: createLogger(environment), isDatabaseReady: isMongoReady });
const validJob = {
  title: 'Senior Backend Engineer', description: 'Build reliable backend systems with a collaborative engineering team.',
  requirements: ['Five years of backend experience'], skills: ['TypeScript'], location: { city: 'Bengaluru', country: 'India' },
  workMode: 'HYBRID', employmentType: 'FULL_TIME', salary: { min: 100_000, max: 150_000, currency: 'USD', period: 'YEAR', visible: false },
};

async function registerEmployer(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/register').send({ email, password: 'correct horse battery staple', role: 'EMPLOYER' }).expect(201);
  return response.body.accessToken as string;
}

async function createCompany(token: string, name: string): Promise<void> {
  await request(app).post('/api/v1/employer/company').set('authorization', `Bearer ${token}`).send({ name, location: { city: 'Bengaluru', country: 'India' } }).expect(201);
}

const describeIntegration = enabled ? describe : describe.skip;

describeIntegration('job HTTP integration', () => {
  beforeAll(async () => {
    assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI);
    await connectMongo(environment.MONGODB_URI, createLogger(environment));
  });
  beforeEach(async () => {
    assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI);
    await mongoose.connection.dropDatabase();
  });
  afterAll(async () => {
    assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
  });

  it('keeps Job ownership and lifecycle server-controlled through the full flow', async () => {
    const employerToken = await registerEmployer('employer@example.test');
    await createCompany(employerToken, 'Acme');
    const created = await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${employerToken}`).send(validJob).expect(201);
    expect(created.body.job).toMatchObject({ status: 'DRAFT', title: validJob.title });
    expect(created.body.job).not.toHaveProperty('createdBy');
    expect(created.body.job.slug).toMatch(/^senior-backend-engineer-[a-f0-9]{8}$/);
    const [storedJob, company] = await Promise.all([Job.findById(created.body.job.id).lean(), Company.findOne({ name: 'Acme' }).lean()]);
    expect(storedJob?.companyId.toString()).toBe(company?._id.toString());
    expect(storedJob?.createdBy.toString()).toBe((await User.findOne({ email: 'employer@example.test' }).lean())?._id.toString());

    await request(app).get(`/api/v1/jobs/${created.body.job.slug}`).expect(404);
    const edited = await request(app).patch(`/api/v1/employer/jobs/${created.body.job.id}`).set('authorization', `Bearer ${employerToken}`).send({ title: 'Principal Backend Engineer' }).expect(200);
    expect(edited.body.job.slug).toBe(created.body.job.slug);
    const published = await request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/publish`).set('authorization', `Bearer ${employerToken}`).expect(200);
    expect(published.body.job.status).toBe('PUBLISHED');
    expect(published.body.job.publishedAt).toBeDefined();

    const publicJob = await request(app).get(`/api/v1/jobs/${created.body.job.slug}`).expect(200);
    expect(publicJob.body.job).not.toHaveProperty('createdBy');
    expect(publicJob.body.job).not.toHaveProperty('salary');
    expect(publicJob.body.job.company).not.toHaveProperty('ownerUserId');
    expect(publicJob.body.job.company).not.toHaveProperty('createdAt');
    await request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/close`).set('authorization', `Bearer ${employerToken}`).expect(200);
    await request(app).get(`/api/v1/jobs/${created.body.job.slug}`).expect(404);
    await request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/archive`).set('authorization', `Bearer ${employerToken}`).expect(200);
    await request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/publish`).set('authorization', `Bearer ${employerToken}`).expect(409);
  });

  it('enforces role, company prerequisite, and cross-company privacy', async () => {
    const noCompany = await registerEmployer('no-company@example.test');
    await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${noCompany}`).send(validJob).expect(409);
    const applicant = await request(app).post('/api/v1/auth/register').send({ email: 'applicant@example.test', password: 'correct horse battery staple', role: 'APPLICANT' }).expect(201);
    await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${applicant.body.accessToken}`).send(validJob).expect(403);

    const firstEmployer = await registerEmployer('first@example.test');
    await createCompany(firstEmployer, 'First Company');
    await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${firstEmployer}`).send({ ...validJob, companyId: '507f1f77bcf86cd799439011', createdBy: '507f1f77bcf86cd799439012' }).expect(400);
    const job = await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${firstEmployer}`).send(validJob).expect(201);
    const secondEmployer = await registerEmployer('second@example.test');
    await createCompany(secondEmployer, 'Second Company');
    await request(app).get(`/api/v1/employer/jobs/${job.body.job.id}`).set('authorization', `Bearer ${secondEmployer}`).expect(404);
    await request(app).patch(`/api/v1/employer/jobs/${job.body.job.id}`).set('authorization', `Bearer ${firstEmployer}`).send({ status: 'PUBLISHED' }).expect(400);
  });

  it('uses bounded management filters and permits only one competing publish transition', async () => {
    const employerToken = await registerEmployer('manager@example.test');
    await createCompany(employerToken, 'Manager Company');
    const created = await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${employerToken}`).send(validJob).expect(201);
    const [first, second] = await Promise.all([
      request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/publish`).set('authorization', `Bearer ${employerToken}`),
      request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/publish`).set('authorization', `Bearer ${employerToken}`),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const list = await request(app).get('/api/v1/employer/jobs?status=PUBLISHED&page=1&limit=20&sort=-publishedAt').set('authorization', `Bearer ${employerToken}`).expect(200);
    expect(list.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(list.body.jobs).toHaveLength(1);
    expect(await Job.countDocuments({ status: 'PUBLISHED' })).toBe(1);
    expect(await User.countDocuments()).toBe(1);
    expect(await AuthSession.countDocuments()).toBe(1);
    expect(await Company.countDocuments()).toBe(1);
  });
});
