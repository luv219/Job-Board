import { describe, expect, it } from 'vitest';
import { applicantCreateSchema, companyCreateSchema } from '../src/profiles/validation.js';
import { slugify } from '../src/profiles/slug.js';

describe('profile validation', () => {
  const validApplicant = { fullName: 'Ada Lovelace', location: { city: 'London', country: 'United Kingdom' } };
  it('bounds and normalizes applicant inputs', () => {
    expect(applicantCreateSchema.parse({ ...validApplicant, skills: ['TypeScript', 'typescript'] }).skills).toEqual(['TypeScript']);
    expect(() => applicantCreateSchema.parse({ ...validApplicant, skills: Array.from({ length: 31 }, () => 'Skill') })).toThrow();
    expect(() => applicantCreateSchema.parse({ ...validApplicant, unknown: 'field' })).toThrow();
  });
  it('rejects invalid experience dates and current entries with end dates', () => {
    const base = { ...validApplicant, experience: [{ title: 'Developer', companyName: 'Acme', startDate: '2025-01-01', endDate: '2024-01-01', isCurrent: false }] };
    expect(() => applicantCreateSchema.parse(base)).toThrow();
    expect(() => applicantCreateSchema.parse({ ...base, experience: [{ ...base.experience[0], endDate: '2025-01-02', isCurrent: true }] })).toThrow();
  });
  it('accepts only safe company websites', () => {
    expect(() => companyCreateSchema.parse({ name: 'Acme Ltd', location: { city: 'London', country: 'UK' }, website: 'javascript:alert(1)' })).toThrow();
  });
});

describe('company slugs', () => {
  it('normalizes casing, punctuation, and whitespace into a stable slug', () => {
    expect(slugify(' Acme & Sons, Inc. ')).toBe('acme-sons-inc');
    expect(slugify('Café Technologies')).toBe('cafe-technologies');
  });
});
