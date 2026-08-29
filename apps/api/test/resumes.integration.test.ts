import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';
import { loadEnvironment } from '../src/config/env.js';
import { assertSafeTestDatabase } from '../src/lib/test-database.js';
import { connectMongo, disconnectMongo, isMongoReady } from '../src/lib/mongodb.js';
import { ApplicantProfile } from '../src/models/applicant-profile.js';
import { MAX_RESUME_BYTES } from '../src/resume/validation.js';
import { FakeResumeStorageProvider } from './helpers/fake-resume-storage.js';

const enabled = process.env.RUN_MONGODB_TESTS === '1';
const describeIntegration = enabled ? describe : describe.skip;
const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000, MONGODB_URI: 'mongodb://127.0.0.1:27017/job_board_phase6_test',
  WEB_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters', ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web', ACCESS_TOKEN_TTL_SECONDS: 600, REFRESH_TOKEN_TTL_DAYS: 7,
};
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');

function makeApp(storage: FakeResumeStorageProvider) {
  return createApp({ environment, logger: createLogger(environment), isDatabaseReady: isMongoReady, resumeStorageProvider: storage });
}

async function registerApplicant(app: ReturnType<typeof makeApp>, email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/register').send({ email, password: 'correct horse battery staple', role: 'APPLICANT' }).expect(201);
  return response.body.accessToken as string;
}

async function createProfile(app: ReturnType<typeof makeApp>, token: string): Promise<void> {
  await request(app).post('/api/v1/applicant/profile').set('authorization', `Bearer ${token}`).send({ fullName: 'Ada Lovelace', location: { city: 'London', country: 'United Kingdom' } }).expect(201);
}

function resumeRequest(app: ReturnType<typeof makeApp>, token: string, contents = pdf, filename = 'resume.pdf', contentType = 'application/pdf') {
  return request(app).put('/api/v1/applicant/resume').set('authorization', `Bearer ${token}`).attach('resume', contents, { filename, contentType });
}

describe('resume configuration', () => {
  it('requires Cloudinary credentials for production but permits test injection', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://localhost:27017/job_board', WEB_ORIGIN: 'https://web.example', ACCESS_TOKEN_SECRET: 'a-secure-production-secret-that-is-longer-than-32' })).toThrow(/CLOUDINARY/);
  });
});

describeIntegration('resume HTTP integration', () => {
  beforeAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await connectMongo(environment.MONGODB_URI, createLogger(environment)); });
  beforeEach(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); });
  afterAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await disconnectMongo(); });

  it('enforces applicant ownership and a profile prerequisite', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage);
    await request(app).put('/api/v1/applicant/resume').attach('resume', pdf, { filename: 'resume.pdf', contentType: 'application/pdf' }).expect(401);
    const applicant = await registerApplicant(app, 'no-profile@example.test');
    await resumeRequest(app, applicant).expect(409).expect(({ body }) => expect(body.error.code).toBe('PROFILE_REQUIRED'));
    const employer = await request(app).post('/api/v1/auth/register').send({ email: 'employer@example.test', password: 'correct horse battery staple', role: 'EMPLOYER' }).expect(201);
    await resumeRequest(app, employer.body.accessToken as string).expect(403);
  });

  it('stores only controlled metadata, safely replaces it, and exposes no asset ID', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const token = await registerApplicant(app, 'owner@example.test'); await createProfile(app, token);
    const first = await resumeRequest(app, token, pdf, '..\\..\\my-resume.pdf').expect(200);
    expect(first.body.resume).toMatchObject({ originalFilename: 'my-resume.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length });
    expect(first.body.resume).not.toHaveProperty('assetId');
    const second = await resumeRequest(app, token, Buffer.from('%PDF-1.7\nreplacement\n%%EOF'), 'replacement.pdf').expect(200);
    expect(second.body.resume.originalFilename).toBe('replacement.pdf');
    expect(storage.deleted).toEqual(['private/resume-1']);
    const profile = await ApplicantProfile.findOne().lean();
    expect(profile?.resume).toMatchObject({ provider: 'cloudinary', assetId: 'private/resume-2', originalFilename: 'replacement.pdf' });
    expect(JSON.stringify(profile?.resume)).not.toContain('%PDF');
    await request(app).patch('/api/v1/applicant/profile').set('authorization', `Bearer ${token}`).send({ resume: { assetId: 'attacker-controlled' } }).expect(400);
  });

  it('rejects malformed, oversized, extra, and multiple multipart inputs', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const token = await registerApplicant(app, 'validation@example.test'); await createProfile(app, token);
    await resumeRequest(app, token, Buffer.from('not a PDF'), 'resume.pdf').expect(400).expect(({ body }) => expect(body.error.code).toBe('RESUME_INVALID_FILE'));
    await resumeRequest(app, token, pdf, 'resume.exe').expect(400);
    await resumeRequest(app, token, pdf, 'resume.pdf', 'text/plain').expect(415);
    await resumeRequest(app, token, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_RESUME_BYTES)])).expect(413).expect(({ body }) => expect(body.error.code).toBe('RESUME_TOO_LARGE'));
    await request(app).put('/api/v1/applicant/resume').set('authorization', `Bearer ${token}`).field('unexpected', 'value').attach('resume', pdf, { filename: 'resume.pdf', contentType: 'application/pdf' }).expect(400);
    await request(app).put('/api/v1/applicant/resume').set('authorization', `Bearer ${token}`).attach('resume', pdf, { filename: 'one.pdf', contentType: 'application/pdf' }).attach('resume', pdf, { filename: 'two.pdf', contentType: 'application/pdf' }).expect(400);
  });

  it('issues owner-only temporary access and removes the active metadata', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const owner = await registerApplicant(app, 'access@example.test'); await createProfile(app, owner);
    await resumeRequest(app, owner).expect(200);
    const access = await request(app).post('/api/v1/applicant/resume/access').set('authorization', `Bearer ${owner}`).expect(200);
    expect(access.headers['cache-control']).toBe('private, no-store');
    expect(access.body).toMatchObject({ accessUrl: expect.stringContaining('storage.invalid/private/'), expiresAt: expect.any(String) });
    const other = await registerApplicant(app, 'other@example.test'); await createProfile(app, other);
    await request(app).get('/api/v1/applicant/resume').set('authorization', `Bearer ${other}`).expect(404);
    await request(app).delete('/api/v1/applicant/resume').set('authorization', `Bearer ${owner}`).expect(204);
    expect(storage.deleted).toEqual(['private/resume-1']);
    await request(app).post('/api/v1/applicant/resume/access').set('authorization', `Bearer ${owner}`).expect(404);
  });

  it('keeps the old metadata when an upload provider fails and returns a safe error', async () => {
    const storage = new FakeResumeStorageProvider(); const app = makeApp(storage); const token = await registerApplicant(app, 'failure@example.test'); await createProfile(app, token);
    await resumeRequest(app, token).expect(200);
    storage.failUpload = true;
    await resumeRequest(app, token, Buffer.from('%PDF-1.7\nfailure\n%%EOF'), 'new.pdf').expect(502).expect(({ body }) => expect(body.error.code).toBe('RESUME_STORAGE_ERROR'));
    const metadata = await request(app).get('/api/v1/applicant/resume').set('authorization', `Bearer ${token}`).expect(200);
    expect(metadata.body.resume.originalFilename).toBe('resume.pdf');
  });
});
