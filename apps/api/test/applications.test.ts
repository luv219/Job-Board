import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Application } from '../src/models/application.js';
import { submitApplicationSchema } from '../src/applications/validation.js';

describe('application model and input contract', () => {
  it('requires a snapshot for submitted applications and declares the ownership indexes', async () => {
    const incomplete = new Application({ jobId: new Types.ObjectId(), companyId: new Types.ObjectId(), applicantUserId: new Types.ObjectId(), status: 'SUBMITTED', appliedAt: new Date() });
    await expect(incomplete.validate()).rejects.toMatchObject({ errors: { resumeSnapshot: expect.anything() } });
    expect(Application.schema.indexes()).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.objectContaining({ jobId: 1, applicantUserId: 1 }), expect.objectContaining({ unique: true })]),
      expect.arrayContaining([expect.objectContaining({ applicantUserId: 1, appliedAt: -1 })]),
    ]));
  });

  it('requires relationship fields and accepts only explicit application statuses', async () => {
    await expect(new Application({ status: 'CREATING', appliedAt: new Date() }).validate()).rejects.toMatchObject({ errors: { jobId: expect.anything(), companyId: expect.anything(), applicantUserId: expect.anything() } });
    await expect(new Application({ jobId: new Types.ObjectId(), companyId: new Types.ObjectId(), applicantUserId: new Types.ObjectId(), status: 'INVALID', appliedAt: new Date() }).validate()).rejects.toMatchObject({ errors: { status: expect.anything() } });
  });

  it('accepts bounded plain-text cover letters and rejects mass-assignment fields', () => {
    expect(submitApplicationSchema.parse({ coverLetter: 'I would like to apply.' })).toEqual({ coverLetter: 'I would like to apply.' });
    expect(() => submitApplicationSchema.parse({ coverLetter: '<p>HTML</p>' })).toThrow();
    expect(() => submitApplicationSchema.parse({ status: 'SUBMITTED' })).toThrow();
    expect(() => submitApplicationSchema.parse({ coverLetter: 'x'.repeat(5_001) })).toThrow();
  });
});
