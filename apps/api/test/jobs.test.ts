import { describe, expect, it } from 'vitest';
import { Job } from '../src/models/job.js';
import { canEditJob, canTransition, createJobSlug, isPublishable } from '../src/jobs/lifecycle.js';
import { publicJobResponse } from '../src/jobs/serializers.js';
import { jobCreateSchema } from '../src/jobs/validation.js';

const validJob = {
  title: 'Senior Backend Engineer', description: 'Build reliable backend systems with a collaborative engineering team.',
  requirements: ['Five years of backend experience'], skills: ['TypeScript', 'typescript'],
  location: { city: 'Bengaluru', country: 'India' }, workMode: 'HYBRID', employmentType: 'FULL_TIME',
};

describe('job validation and lifecycle rules', () => {
  it('enforces bounded, normalized job input and salary rules', () => {
    expect(jobCreateSchema.parse(validJob).skills).toEqual(['TypeScript']);
    expect(() => jobCreateSchema.parse({ ...validJob, title: ' ', salary: { min: 20, currency: 'US', period: 'YEAR', visible: true } })).toThrow();
    expect(jobCreateSchema.parse({ ...validJob, salary: { min: 20, max: 30, currency: 'usd', period: 'YEAR', visible: false } }).salary?.currency).toBe('USD');
    expect(() => jobCreateSchema.parse({ ...validJob, salary: { min: 31, max: 30, currency: 'USD', period: 'YEAR', visible: true } })).toThrow();
    expect(() => jobCreateSchema.parse({ ...validJob, requirements: Array.from({ length: 31 }, () => 'Requirement') })).toThrow();
    expect(() => jobCreateSchema.parse({ ...validJob, status: 'PUBLISHED' })).toThrow();
  });

  it('keeps slug identity stable and makes only explicit transitions available', () => {
    expect(createJobSlug('Senior Backend Engineer', 'a1b2c3')).toBe('senior-backend-engineer-a1b2c3');
    expect(canTransition('DRAFT', 'publish')).toBe(true);
    expect(canTransition('PUBLISHED', 'close')).toBe(true);
    expect(canTransition('CLOSED', 'archive')).toBe(true);
    expect(canTransition('ARCHIVED', 'publish')).toBe(false);
    expect(canEditJob('PUBLISHED')).toBe(true);
    expect(canEditJob('CLOSED')).toBe(false);
    expect(isPublishable({ ...jobCreateSchema.parse(validJob), applicationDeadline: new Date(Date.now() - 1) })).toBe(false);
  });

  it('has schema-level required fields and controlled enum values', async () => {
    const job = new Job({ companyId: '507f1f77bcf86cd799439011', createdBy: '507f1f77bcf86cd799439012', slug: 'senior-backend-engineer-a1b2c3' });
    await expect(job.validate()).rejects.toMatchObject({ errors: expect.objectContaining({ title: expect.anything(), description: expect.anything(), workMode: expect.anything(), employmentType: expect.anything() }) });
  });
});

describe('public job serialization', () => {
  it('omits ownership, internal company fields, and hidden salary', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const job = {
      _id: { toString: () => 'job-id' }, companyId: { toString: () => 'company-id' }, createdBy: { toString: () => 'user-id' },
      ...jobCreateSchema.parse({ ...validJob, salary: { min: 100, max: 150, currency: 'USD', period: 'YEAR', visible: false } }),
      slug: 'senior-backend-engineer-a1b2c3', status: 'PUBLISHED' as const, publishedAt: now, createdAt: now, updatedAt: now,
    };
    const company = { _id: { toString: () => 'company-id' }, ownerUserId: { toString: () => 'owner-id' }, name: 'Acme', slug: 'acme', location: { city: 'Bengaluru', country: 'India' }, createdAt: now, updatedAt: now };
    const response = publicJobResponse(job, company);
    expect(response).not.toHaveProperty('createdBy');
    expect(response).not.toHaveProperty('salary');
    expect(response.company).not.toHaveProperty('ownerUserId');
    expect(response.company).not.toHaveProperty('createdAt');
  });
});
