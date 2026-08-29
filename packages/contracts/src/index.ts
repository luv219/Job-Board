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
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CONFLICT',
  'TOO_MANY_REQUESTS',
  'PROFILE_NOT_FOUND',
  'PROFILE_ALREADY_EXISTS',
  'COMPANY_NOT_FOUND',
  'COMPANY_ALREADY_EXISTS',
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

export const userRoleSchema = z.enum(['APPLICANT', 'EMPLOYER']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  accountStatus: z.enum(['ACTIVE', 'DISABLED']),
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: publicUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const locationSchema = z.object({ city: z.string(), state: z.string().optional(), country: z.string() });
export const applicantProfileSchema = z.object({
  id: z.string(), fullName: z.string(), headline: z.string().optional(), bio: z.string().optional(),
  location: locationSchema, skills: z.array(z.string()), experience: z.array(z.unknown()), education: z.array(z.unknown()),
  createdAt: z.string(), updatedAt: z.string(),
});
export const employerProfileSchema = z.object({ id: z.string(), fullName: z.string(), jobTitle: z.string().optional(), phone: z.string().optional(), createdAt: z.string(), updatedAt: z.string() });
export const companyPublicSchema = z.object({
  id: z.string(), name: z.string(), slug: z.string(), description: z.string().optional(), website: z.string().optional(),
  industry: z.string().optional(), companySize: z.string().optional(), location: locationSchema, createdAt: z.string(), updatedAt: z.string(),
});
