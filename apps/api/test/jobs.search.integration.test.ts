import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import type { Environment } from '../src/config/env.js';
import { assertSafeTestDatabase } from '../src/lib/test-database.js';
import { connectMongo, disconnectMongo, isMongoReady } from '../src/lib/mongodb.js';
import { Company } from '../src/models/company.js';
import { Job } from '../src/models/job.js';

const enabled = process.env.RUN_MONGODB_TESTS === '1';
const environment: Environment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3000, MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/job_board_phase5_test',
  WEB_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'silent', REQUEST_BODY_LIMIT: 102_400,
  ACCESS_TOKEN_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters', ACCESS_TOKEN_ISSUER: 'job-board-api',
  ACCESS_TOKEN_AUDIENCE: 'job-board-web', ACCESS_TOKEN_TTL_SECONDS: 600, REFRESH_TOKEN_TTL_DAYS: 7,
};
const app = createApp({ environment, logger: createLogger(environment), isDatabaseReady: isMongoReady });
const describeIntegration = enabled ? describe : describe.skip;

async function seedJobs(): Promise<void> {
  const now = new Date();
  const [acme, zen] = await Company.create([
    { ownerUserId: new Types.ObjectId(), name: 'Acme', slug: 'acme', industry: 'Technology', companySize: '51-200', location: { city: 'Bengaluru', country: 'India' } },
    { ownerUserId: new Types.ObjectId(), name: 'Zen', slug: 'zen', industry: 'Design', companySize: '11-50', location: { city: 'Delhi', country: 'India' } },
  ]);
  const common = { createdBy: new Types.ObjectId(), description: 'Build reliable software with a collaborative team and modern engineering practices.', requirements: ['Production engineering experience'], applicationDeadline: new Date(now.getTime() + 86_400_000) };
  await Job.create([
    { ...common, companyId: acme._id, title: 'Backend Node Engineer', slug: 'backend-node-engineer-a1b2c3d4', skills: ['Node.js', 'MongoDB'], location: { city: 'Bengaluru', country: 'India' }, workMode: 'REMOTE', employmentType: 'FULL_TIME', salary: { min: 100_000, max: 150_000, currency: 'USD', period: 'YEAR', visible: true }, status: 'PUBLISHED', publishedAt: new Date(now.getTime() - 3_600_000) },
    { ...common, companyId: zen._id, title: 'Frontend Designer', slug: 'frontend-designer-b1b2c3d4', skills: ['React'], location: { city: 'Delhi', country: 'India' }, workMode: 'HYBRID', employmentType: 'PART_TIME', salary: { min: 80_000, max: 90_000, currency: 'INR', period: 'YEAR', visible: true }, status: 'PUBLISHED', publishedAt: new Date(now.getTime() - 10 * 86_400_000) },
    { ...common, companyId: acme._id, title: 'Hidden Node Role', slug: 'hidden-node-role-c1b2c3d4', skills: ['Node.js'], location: { city: 'Bengaluru', country: 'India' }, workMode: 'REMOTE', employmentType: 'FULL_TIME', salary: { min: 200_000, max: 300_000, currency: 'USD', period: 'YEAR', visible: false }, status: 'PUBLISHED', publishedAt: new Date(now.getTime() - 2 * 86_400_000) },
    { ...common, companyId: acme._id, title: 'Expired Backend Role', slug: 'expired-backend-role-d1b2c3d4', skills: ['MongoDB'], location: { city: 'Bengaluru', country: 'India' }, workMode: 'REMOTE', employmentType: 'FULL_TIME', status: 'PUBLISHED', publishedAt: new Date(now.getTime() - 1_000), applicationDeadline: new Date(now.getTime() - 1_000) },
    { ...common, companyId: acme._id, title: 'Draft Node Role', slug: 'draft-node-role-e1b2c3d4', skills: ['Node.js'], location: { city: 'Bengaluru', country: 'India' }, workMode: 'REMOTE', employmentType: 'FULL_TIME', status: 'DRAFT' },
    { ...common, companyId: acme._id, title: 'Closed Node Role', slug: 'closed-node-role-f1b2c3d4', skills: ['Node.js'], location: { city: 'Bengaluru', country: 'India' }, workMode: 'REMOTE', employmentType: 'FULL_TIME', status: 'CLOSED', publishedAt: new Date(now.getTime() - 1_000) },
    { ...common, companyId: acme._id, title: 'Archived Node Role', slug: 'archived-node-role-a2b2c3d4', skills: ['Node.js'], location: { city: 'Bengaluru', country: 'India' }, workMode: 'REMOTE', employmentType: 'FULL_TIME', status: 'ARCHIVED' },
  ]);
}

describeIntegration('public Job discovery HTTP integration', () => {
  beforeAll(async () => {
    assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI);
    await connectMongo(environment.MONGODB_URI, createLogger(environment));
    await mongoose.connection.dropDatabase();
    await Job.init();
  });
  beforeEach(async () => { await Promise.all([Job.deleteMany({}), Company.deleteMany({})]); await seedJobs(); });
  afterAll(async () => { assertSafeTestDatabase(environment.NODE_ENV, environment.MONGODB_URI); await mongoose.connection.dropDatabase(); await disconnectMongo(); });

  it('is public, paginated, newest-first, and excludes inactive or expired Jobs', async () => {
    const response = await request(app).get('/api/v1/jobs').expect(200);
    expect(response.body.pagination).toMatchObject({ page: 1, limit: 20, total: 3, totalPages: 1 });
    expect(response.body.items.map((item: { slug: string }) => item.slug)).toEqual(['backend-node-engineer-a1b2c3d4', 'hidden-node-role-c1b2c3d4', 'frontend-designer-b1b2c3d4']);
    expect(JSON.stringify(response.body.items)).not.toContain('createdBy');
    expect(JSON.stringify(response.body.items)).not.toContain('ownerUserId');
    expect(response.body.items.find((item: { slug: string }) => item.slug === 'hidden-node-role-c1b2c3d4')).not.toHaveProperty('salary');
    await request(app).get('/api/v1/jobs?page=1&limit=1&sort=oldest').expect(200).expect((result) => expect(result.body.items[0].slug).toBe('frontend-designer-b1b2c3d4'));
  });

  it('uses bounded MongoDB text search and escaped literal matching filters', async () => {
    await request(app).get('/api/v1/jobs?q=backend').expect(200).expect((result) => expect(result.body.items.map((item: { slug: string }) => item.slug)).toEqual(['backend-node-engineer-a1b2c3d4']));
    await request(app).get('/api/v1/jobs?q=mongodb').expect(200).expect((result) => expect(result.body.items.map((item: { slug: string }) => item.slug)).toEqual(['backend-node-engineer-a1b2c3d4']));
    await request(app).get('/api/v1/jobs?q=collaborative').expect(200).expect((result) => expect(result.body.items).toHaveLength(3));
    await request(app).get('/api/v1/jobs?city=.*').expect(200).expect((result) => expect(result.body.items).toHaveLength(0));
    await request(app).get('/api/v1/jobs?q=%20').expect(400);
    await request(app).get(`/api/v1/jobs?q=${'a'.repeat(101)}`).expect(400);
  });

  it('composes location, enum, skill, company, posted date, and salary filters safely', async () => {
    const combined = await request(app).get('/api/v1/jobs?city=bengaluru&country=india&workMode=REMOTE&employmentType=FULL_TIME&skills=mongodb&company=acme&postedWithin=24h').expect(200);
    expect(combined.body.items.map((item: { slug: string }) => item.slug)).toEqual(['backend-node-engineer-a1b2c3d4']);
    await request(app).get('/api/v1/jobs?skills=node.js,react').expect(200).expect((result) => expect(result.body.items).toHaveLength(3));
    await request(app).get('/api/v1/jobs?skills=.*').expect(200).expect((result) => expect(result.body.items).toHaveLength(0));
    await request(app).get('/api/v1/jobs?company=unknown-company').expect(200).expect((result) => expect(result.body.pagination.total).toBe(0));
    await request(app).get('/api/v1/jobs?salaryMin=120000&currency=USD&salaryPeriod=YEAR').expect(200).expect((result) => expect(result.body.items.map((item: { slug: string }) => item.slug)).toEqual(['backend-node-engineer-a1b2c3d4']));
    await request(app).get('/api/v1/jobs?salaryMax=110000&currency=USD&salaryPeriod=YEAR').expect(200).expect((result) => expect(result.body.items.map((item: { slug: string }) => item.slug)).toEqual(['backend-node-engineer-a1b2c3d4']));
    await request(app).get('/api/v1/jobs?salaryMin=100000&salaryMax=150000&currency=USD&salaryPeriod=YEAR').expect(200).expect((result) => expect(result.body.items).toHaveLength(1));
    await request(app).get('/api/v1/jobs?salaryMin=260000&currency=USD&salaryPeriod=YEAR').expect(200).expect((result) => expect(result.body.items).toHaveLength(0));
  });

  it('rejects invalid parameters, operator-shaped input, and pagination abuse', async () => {
    await request(app).get('/api/v1/jobs?workMode=INVALID').expect(400);
    await request(app).get('/api/v1/jobs?salaryMin=100&salaryMax=99&currency=USD&salaryPeriod=YEAR').expect(400);
    await request(app).get('/api/v1/jobs?salaryMin=100').expect(400);
    await request(app).get('/api/v1/jobs?sort=createdAt').expect(400);
    await request(app).get('/api/v1/jobs?sort=relevance').expect(400);
    await request(app).get('/api/v1/jobs?skills=node,react,mongodb,typescript,go,rust,java,python,php,ruby,swift').expect(400);
    await request(app).get('/api/v1/jobs?limit=0').expect(400);
    await request(app).get('/api/v1/jobs?limit=999999').expect(400);
    await request(app).get('/api/v1/jobs?page=-1').expect(400);
    await request(app).get('/api/v1/jobs?q[$ne]=backend').expect(400);
    await request(app).get('/api/v1/jobs?workMode[$ne]=REMOTE').expect(400);
    await request(app).get('/api/v1/jobs?unknown=value').expect(400);
  });

  it('returns bounded, public-only autocomplete suggestions and facet counts', async () => {
    const response = await request(app).get('/api/v1/jobs/autocomplete?q=ba').expect(200);
    expect(response.body.suggestions).toContainEqual({ type: 'JOB_TITLE', value: 'Backend Node Engineer' });
    expect(JSON.stringify(response.body.suggestions)).not.toContain('Draft Node Role');
    await request(app).get('/api/v1/jobs/autocomplete?q=b').expect(400);
    const search = await request(app).get('/api/v1/jobs?workMode=REMOTE').expect(200);
    expect(search.body.facets.workMode).toContainEqual({ value: 'REMOTE', count: 2 });
  });
});
