import { z } from 'zod';
import { paginationSchema } from '../lib/pagination.js';

export const jobIdParamsSchema = z.object({ jobId: z.string().regex(/^[a-f\d]{24}$/i, 'Job identifier is invalid') }).strict();
export const emptyBodySchema = z.object({}).strict().default({});
export const savedJobListSchema = z.object({
  ...paginationSchema.shape,
  sort: z.enum(['recently_saved', 'oldest_saved']).default('recently_saved'),
}).strict();
export const dashboardQuerySchema = z.object({}).strict();

export type SavedJobListQuery = z.infer<typeof savedJobListSchema>;
