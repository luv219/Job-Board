import { z } from 'zod';
import { applicationStatuses } from '../models/application.js';
import { paginationSchema } from '../lib/pagination.js';

const plainText = z.string().trim().min(1).max(5_000).refine((value) => !/<\/?[a-z][^>]*>/i.test(value), 'Cover letter must be plain text');

export const submitApplicationSchema = z.object({ coverLetter: plainText.optional() }).strict();
export const applicationIdParamsSchema = z.object({ applicationId: z.string().regex(/^[a-f\d]{24}$/i, 'Application identifier is invalid') }).strict();
export const jobApplicationParamsSchema = z.object({ jobId: z.string().regex(/^[a-f\d]{24}$/i, 'Job identifier is invalid') }).strict();
export const applicantApplicationListSchema = z.object({
  ...paginationSchema.shape,
  status: z.enum(applicationStatuses.filter((status) => status !== 'CREATING') as [string, ...string[]]).optional(),
}).strict();

export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>;
export type ApplicantApplicationListQuery = z.infer<typeof applicantApplicationListSchema>;
