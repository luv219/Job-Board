import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const notReadyResponseSchema = z.object({
  status: z.literal('not_ready'),
});

export type NotReadyResponse = z.infer<typeof notReadyResponseSchema>;
