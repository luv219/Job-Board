import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const notReadyResponseSchema = z.object({
  status: z.literal('not_ready'),
  dependencies: z.object({ mongodb: z.literal('unavailable') }),
});

export type NotReadyResponse = z.infer<typeof notReadyResponseSchema>;

export const readyResponseSchema = z.object({
  status: z.literal('ready'),
  dependencies: z.object({ mongodb: z.literal('available') }),
});

export type ReadyResponse = z.infer<typeof readyResponseSchema>;

export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'INTERNAL_ERROR',
]);

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
