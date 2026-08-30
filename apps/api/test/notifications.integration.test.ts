import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';
import { assertSafeTestDatabase } from '../src/lib/test-database.js';
import { connectMongo, disconnectMongo, isMongoReady } from '../src/lib/mongodb.js';
import { AccountToken } from '../src/models/account-token.js';
import { AuthSession } from '../src/models/auth-session.js';
import { Application } from '../src/models/application.js';
import { User } from '../src/models/user.js';
import { createOneTimeToken, hashOneTimeToken } from '../src/auth/tokens.js';
import { buildNewApplicationEmail } from '../src/notifications/email-templates.js';
import { FakeEmailProvider } from './helpers/fake-email-provider.js';
import { FakeResumeStorageProvider } from './helpers/fake-resume-storage.js';

const enabled = process.env.RUN_MONGODB_TESTS === '1';
const describeIntegration = enabled ? describe : describe.skip;
const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000, MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/job_board_phase10_test',
  WEB_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters', ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web', ACCESS_TOKEN_TTL_SECONDS: 600, REFRESH_TOKEN_TTL_DAYS: 7,
};
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const jobInput = { title: 'Platform Engineer', description: 'Build reliable platform systems with a collaborative engineering team.', requirements: ['Production engineering experience'], skills: ['TypeScript'], location: { city: 'Bengaluru', country: 'India' }, workMode: 'HYBRID', employmentType: 'FULL_TIME' };

function makeApp(emailProvider: FakeEmailProvider, storage = new FakeResumeStorageProvider()) { return createApp({ environment, logger: createLogger(environment), isDatabaseReady: isMongoReady, resumeStorageProvider: storage, emailProvider }); }
type TestApp = ReturnType<typeof makeApp>;

function tokenFrom(message: { text: string }): string {
  const token = /[?&]token=([A-Za-z0-9_-]{43})/.exec(message.text)?.[1];
  if (!token) throw new Error('Expected email token');
  return token;
}
async function register(app: TestApp, email: string, role: 'APPLICANT' | 'EMPLOYER') {
  return request(app).post('/api/v1/auth/register').send({ email, password: 'correct horse battery staple', role }).expect(201);
}
async function prepareApplicant(app: TestApp, email: string) {
  const response = await register(app, email, 'APPLICANT'); const token = response.body.accessToken as string;
  await request(app).post('/api/v1/applicant/profile').set('authorization', `Bearer ${token}`).send({ fullName: 'Ada Lovelace', location: { city: 'London', country: 'United Kingdom' } }).expect(201);
  await request(app).put('/api/v1/applicant/resume').set('authorization', `Bearer ${token}`).attach('resume', pdf, { filename: 'resume.pdf', contentType: 'application/pdf' }).expect(200);
  return { token, response };
}
async function createJob(app: TestApp, suffix: string) {
  const registration = await register(app, `employer-${suffix}@example.test`, 'EMPLOYER'); const employerToken = registration.body.accessToken as string;
  await request(app).post('/api/v1/employer/company').set('authorization', `Bearer ${employerToken}`).send({ name: `Acme ${suffix}`, location: { city: 'Bengaluru', country: 'India' } }).expect(201);
  const created = await request(app).post('/api/v1/employer/jobs').set('authorization', `Bearer ${employerToken}`).send({ ...jobInput, title: `${jobInput.title} ${suffix}` }).expect(201);
  await request(app).post(`/api/v1/employer/jobs/${created.body.job.id}/publish`).set('authorization', `Bearer ${employerToken}`).expect(200);
  return { id: created.body.job.id as string, employerToken, employerEmail: `employer-${suffix}@example.test` };
}

describeIntegration('email notifications and account recovery', () => {
  beforeAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await connectMongo(environment.MONGODB_URI, createLogger(environment)); });
  beforeEach(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await AccountToken.syncIndexes(); await Application.syncIndexes(); });
  afterAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await disconnectMongo(); });

  it('uses high-entropy hashed, purpose-isolated, expiring one-time account tokens', async () => {
    const raw = createOneTimeToken(); expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(hashOneTimeToken(raw)).not.toBe(raw);
    expect(AccountToken.schema.indexes()).toEqual(expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ expiresAt: 1 })]) ]));
    const email = new FakeEmailProvider(); const app = makeApp(email); const registration = await register(app, 'verify@example.test', 'APPLICANT');
    const verification = email.messages.find((message) => message.type === 'EMAIL_VERIFICATION')!; const token = tokenFrom(verification);
    expect(verification.text).toContain('http://localhost:5173/verify-email?token='); expect(verification.text).not.toContain('attacker.invalid');
    const stored = await AccountToken.findOne({ purpose: 'EMAIL_VERIFICATION' }).lean(); expect(stored?.tokenHash).toBeUndefined();
    await request(app).post('/api/v1/auth/email-verification/confirm').set('host', 'attacker.invalid').send({ token }).expect(204);
    expect((await User.findById(registration.body.user.id).lean())?.emailVerified).toBe(true);
    await request(app).post('/api/v1/auth/email-verification/confirm').send({ token }).expect(400);
    await request(app).post('/api/v1/auth/password-reset/confirm').send({ token, newPassword: 'another correct horse battery staple' }).expect(400);
  });

  it('rotates verification tokens and does not let an email failure undo registration', async () => {
    const email = new FakeEmailProvider(); const app = makeApp(email); const registered = await register(app, 'resend@example.test', 'APPLICANT');
    const first = tokenFrom(email.messages[0]);
    await request(app).post('/api/v1/auth/email-verification/request').set('authorization', `Bearer ${registered.body.accessToken}`).expect(204);
    const second = tokenFrom(email.messages[1]); expect(second).not.toBe(first);
    await request(app).post('/api/v1/auth/email-verification/confirm').send({ token: first }).expect(400);
    email.fail = true;
    await request(app).post('/api/v1/auth/email-verification/request').set('authorization', `Bearer ${registered.body.accessToken}`).expect(503);
    expect(await AccountToken.countDocuments({ purpose: 'EMAIL_VERIFICATION', consumedAt: null })).toBe(0);
    await request(app).post('/api/v1/auth/password-reset/request').send({ email: 'resend@example.test' }).expect(202);
    const failedRegistration = await register(app, 'delivery-failure@example.test', 'APPLICANT');
    expect(failedRegistration.body.user.emailVerified).toBe(false);
    expect(await User.exists({ email: 'delivery-failure@example.test' })).not.toBeNull();
  });

  it('rejects expired reset tokens and permits only one concurrent confirmation', async () => {
    const email = new FakeEmailProvider(); const app = makeApp(email); await register(app, 'concurrent-reset@example.test', 'APPLICANT'); email.clear();
    await request(app).post('/api/v1/auth/password-reset/request').send({ email: 'concurrent-reset@example.test' }).expect(202);
    const expired = tokenFrom(email.messages[0]);
    await AccountToken.updateOne({ tokenHash: hashOneTimeToken(expired) }, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
    await request(app).post('/api/v1/auth/password-reset/confirm').send({ token: expired, newPassword: 'new correct horse battery staple' }).expect(400);
    await request(app).post('/api/v1/auth/password-reset/request').send({ email: 'concurrent-reset@example.test' }).expect(202);
    const active = tokenFrom(email.messages[1]);
    const [first, second] = await Promise.all([
      request(app).post('/api/v1/auth/password-reset/confirm').send({ token: active, newPassword: 'new correct horse battery staple' }),
      request(app).post('/api/v1/auth/password-reset/confirm').send({ token: active, newPassword: 'new correct horse battery staple' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([204, 400]);
  });

  it('returns a generic reset response, resets once, preserves account fields, and revokes sessions', async () => {
    const email = new FakeEmailProvider(); const app = makeApp(email); const registered = await register(app, 'reset@example.test', 'APPLICANT');
    const cookie = registered.headers['set-cookie'][0] as string; email.clear();
    const existing = await request(app).post('/api/v1/auth/password-reset/request').send({ email: 'reset@example.test' }).expect(202);
    const missing = await request(app).post('/api/v1/auth/password-reset/request').send({ email: 'missing@example.test' }).expect(202);
    expect(existing.body).toEqual(missing.body);
    const reset = email.messages.find((message) => message.type === 'PASSWORD_RESET')!; const token = tokenFrom(reset);
    const before = await User.findOne({ email: 'reset@example.test' }).lean();
    await request(app).post('/api/v1/auth/password-reset/confirm').send({ token, newPassword: 'new correct horse battery staple' }).expect(204);
    await request(app).post('/api/v1/auth/login').send({ email: 'reset@example.test', password: 'correct horse battery staple' }).expect(401);
    await request(app).post('/api/v1/auth/login').send({ email: 'reset@example.test', password: 'new correct horse battery staple' }).expect(200);
    await request(app).post('/api/v1/auth/refresh').set('cookie', cookie).expect(401);
    await request(app).post('/api/v1/auth/password-reset/confirm').send({ token, newPassword: 'third correct horse battery staple' }).expect(400);
    const after = await User.findOne({ email: 'reset@example.test' }).lean();
    expect(after).toMatchObject({ email: before!.email, role: before!.role, accountStatus: before!.accountStatus });
    expect(await AuthSession.countDocuments({ userId: after!._id })).toBe(1);
  });

  it('sends correct submission/status notifications only after successful business changes and isolates provider failures', async () => {
    const email = new FakeEmailProvider(); const storage = new FakeResumeStorageProvider(); const app = makeApp(email, storage); const job = await createJob(app, 'notifications'); const applicant = await prepareApplicant(app, 'applicant-notifications@example.test');
    email.clear();
    const submitted = await request(app).post(`/api/v1/jobs/${job.id}/applications`).set('authorization', `Bearer ${applicant.token}`).send({}).expect(201);
    expect(email.messages.map((message) => message.type).sort()).toEqual(['APPLICATION_SUBMITTED', 'NEW_APPLICATION']);
    expect(email.messages.find((message) => message.type === 'NEW_APPLICATION')?.to).toBe(job.employerEmail);
    expect(JSON.stringify(email.messages)).not.toContain('application-resume');
    email.clear();
    await request(app).post(`/api/v1/jobs/${job.id}/applications`).set('authorization', `Bearer ${applicant.token}`).send({}).expect(409);
    expect(email.messages).toHaveLength(0);
    await request(app).patch(`/api/v1/employer/applications/${submitted.body.application.id}/status`).set('authorization', `Bearer ${job.employerToken}`).send({ status: 'UNDER_REVIEW' }).expect(200);
    expect(email.messages).toHaveLength(1); expect(email.messages[0]).toMatchObject({ type: 'APPLICATION_STATUS_CHANGED', to: 'applicant-notifications@example.test' });
    email.clear();
    await request(app).patch(`/api/v1/employer/applications/${submitted.body.application.id}/status`).set('authorization', `Bearer ${job.employerToken}`).send({ status: 'HIRED' }).expect(409);
    expect(email.messages).toHaveLength(0);
    const failedSnapshotJob = await createJob(app, 'snapshot-failure'); storage.failSnapshot = true; email.clear();
    await request(app).post(`/api/v1/jobs/${failedSnapshotJob.id}/applications`).set('authorization', `Bearer ${applicant.token}`).send({}).expect(503);
    expect(email.messages).toHaveLength(0); storage.failSnapshot = false;
    email.fail = true;
    const secondJob = await createJob(app, 'provider-failure'); const secondApplicant = await prepareApplicant(app, 'applicant-provider-failure@example.test'); email.clear();
    const second = await request(app).post(`/api/v1/jobs/${secondJob.id}/applications`).set('authorization', `Bearer ${secondApplicant.token}`).send({}).expect(201);
    expect(await Application.exists({ _id: second.body.application.id, status: 'SUBMITTED' })).not.toBeNull();
    await request(app).patch(`/api/v1/employer/applications/${second.body.application.id}/status`).set('authorization', `Bearer ${secondJob.employerToken}`).send({ status: 'UNDER_REVIEW' }).expect(200);
    expect((await Application.findById(second.body.application.id).lean())?.status).toBe('UNDER_REVIEW');
  });

  it('escapes untrusted template content and does not send raw content through the console fixture', () => {
    const message = buildNewApplicationEmail({ to: 'owner@example.test', applicantName: '<img src=x onerror=alert(1)>', jobTitle: '<b>CEO</b>', link: 'https://web.example/employer/jobs/1/applications' });
    expect(message.html).toContain('&lt;img src=x onerror=alert(1)&gt;'); expect(message.html).toContain('&lt;b&gt;CEO&lt;/b&gt;');
    expect(message.html).not.toContain('<img src=x'); expect(message.html).not.toContain('<b>CEO</b>');
  });
});
