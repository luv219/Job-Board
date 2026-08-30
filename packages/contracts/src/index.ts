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
  'COMPANY_REQUIRED',
  'JOB_NOT_FOUND',
  'JOB_INVALID_TRANSITION',
  'JOB_NOT_PUBLISHABLE',
  'PROFILE_REQUIRED',
  'RESUME_NOT_FOUND',
  'RESUME_INVALID_FILE',
  'RESUME_UNSUPPORTED_TYPE',
  'RESUME_TOO_LARGE',
  'RESUME_STORAGE_ERROR',
  'APPLICATION_ALREADY_EXISTS',
  'APPLICATION_NOT_FOUND',
  'APPLICATION_NOT_WITHDRAWABLE',
  'JOB_NOT_ACCEPTING_APPLICATIONS',
  'APPLICANT_PROFILE_REQUIRED',
  'RESUME_REQUIRED',
  'RESUME_SNAPSHOT_ERROR',
  'APPLICATION_INVALID_TRANSITION',
  'APPLICATION_STATUS_CONFLICT',
  'EMAIL_DELIVERY_FAILED',
  'TOKEN_INVALID_OR_EXPIRED',
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
  emailVerified: z.boolean(),
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
  hasResume: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
});
export const resumeMetadataSchema = z.object({
  originalFilename: z.string(), mimeType: z.literal('application/pdf'), sizeBytes: z.number().int().positive(), uploadedAt: z.string(),
});
export type ResumeMetadata = z.infer<typeof resumeMetadataSchema>;
export const employerProfileSchema = z.object({ id: z.string(), fullName: z.string(), jobTitle: z.string().optional(), phone: z.string().optional(), createdAt: z.string(), updatedAt: z.string() });
export const companyPublicSchema = z.object({
  id: z.string(), name: z.string(), slug: z.string(), description: z.string().optional(), website: z.string().optional(),
  industry: z.string().optional(), companySize: z.string().optional(), location: locationSchema, createdAt: z.string(), updatedAt: z.string(),
});

export const jobStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']);
export const employmentTypeSchema = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY']);
export const workModeSchema = z.enum(['ONSITE', 'HYBRID', 'REMOTE']);
export const salaryPeriodSchema = z.enum(['YEAR', 'MONTH', 'HOUR']);
export const salarySchema = z.object({
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  period: salaryPeriodSchema,
  visible: z.boolean(),
});
export const publicJobCompanySchema = z.object({
  id: z.string(), name: z.string(), slug: z.string(), description: z.string().optional(), website: z.string().optional(),
  industry: z.string().optional(), companySize: z.string().optional(), location: locationSchema,
});
export const jobPublicSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(), description: z.string(), requirements: z.array(z.string()), skills: z.array(z.string()),
  location: locationSchema, workMode: workModeSchema, employmentType: employmentTypeSchema, salary: salarySchema.optional(),
  applicationDeadline: z.string().optional(), publishedAt: z.string(), company: publicJobCompanySchema,
});
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type EmploymentType = z.infer<typeof employmentTypeSchema>;
export type WorkMode = z.infer<typeof workModeSchema>;
export type Salary = z.infer<typeof salarySchema>;
export type JobPublic = z.infer<typeof jobPublicSchema>;

export const applicationStatusSchema = z.enum(['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN']);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export const applicationResumeSnapshotSchema = resumeMetadataSchema.extend({ capturedAt: z.string() });
export const applicantApplicationJobSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(), workMode: workModeSchema, employmentType: employmentTypeSchema,
  company: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
}).nullable();
export const applicantApplicationSchema = z.object({
  id: z.string(), status: applicationStatusSchema, appliedAt: z.string(), withdrawnAt: z.string().optional(),
  coverLetter: z.string().optional(), resumeSnapshot: applicationResumeSnapshotSchema, job: applicantApplicationJobSchema,
});
export type ApplicantApplication = z.infer<typeof applicantApplicationSchema>;

export const savedJobAvailabilitySchema = z.enum(['ACTIVE', 'EXPIRED', 'CLOSED', 'ARCHIVED', 'UNAVAILABLE']);
export const savedJobItemSchema = z.object({
  id: z.string(), savedAt: z.string(), isActive: z.boolean(), availability: savedJobAvailabilitySchema,
  job: z.object({
    id: z.string(), slug: z.string(), title: z.string(), skills: z.array(z.string()), location: locationSchema,
    workMode: workModeSchema, employmentType: employmentTypeSchema, salary: salarySchema.optional(), applicationDeadline: z.string().optional(),
    publishedAt: z.string().optional(), status: jobStatusSchema,
    company: z.object({ name: z.string(), slug: z.string(), industry: z.string().optional(), location: locationSchema }),
  }).nullable(),
});
export type SavedJobItem = z.infer<typeof savedJobItemSchema>;
export const applicantDashboardSchema = z.object({
  profile: z.object({ exists: z.boolean(), fullName: z.string().optional(), headline: z.string().optional(), location: locationSchema.optional() }),
  resume: z.object({ exists: z.boolean(), originalFilename: z.string().optional(), uploadedAt: z.string().optional() }),
  applications: z.object({
    total: z.number().int().nonnegative(), byStatus: z.record(applicationStatusSchema, z.number().int().nonnegative()),
    recent: z.array(z.object({ id: z.string(), status: applicationStatusSchema, appliedAt: z.string(), job: z.object({ id: z.string(), slug: z.string(), title: z.string(), company: z.object({ name: z.string(), slug: z.string() }) }).nullable() })),
  }),
  savedJobs: z.object({ total: z.number().int().nonnegative(), recent: z.array(savedJobItemSchema) }),
});
export type ApplicantDashboard = z.infer<typeof applicantDashboardSchema>;

export const employerApplicantSummarySchema = z.object({
  fullName: z.string(), headline: z.string().optional(), location: locationSchema, skills: z.array(z.string()),
}).nullable();
export const employerApplicantDetailSchema = employerApplicantSummarySchema.unwrap().extend({
  bio: z.string().optional(), experience: z.array(z.unknown()), education: z.array(z.unknown()),
}).nullable();
export const employerApplicationListItemSchema = z.object({
  id: z.string(), status: applicationStatusSchema, appliedAt: z.string(), updatedAt: z.string(),
  applicant: employerApplicantSummarySchema, resumeSnapshot: applicationResumeSnapshotSchema,
});
export const employerApplicationDetailSchema = z.object({
  id: z.string(), status: applicationStatusSchema, appliedAt: z.string(), updatedAt: z.string(), withdrawnAt: z.string().optional(),
  coverLetter: z.string().optional(), applicant: employerApplicantDetailSchema,
  job: z.object({ id: z.string(), title: z.string(), slug: z.string() }), resumeSnapshot: applicationResumeSnapshotSchema,
});
export type EmployerApplicationListItem = z.infer<typeof employerApplicationListItemSchema>;
export type EmployerApplicationDetail = z.infer<typeof employerApplicationDetailSchema>;

export const publicJobListItemSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(), skills: z.array(z.string()), location: locationSchema,
  workMode: workModeSchema, employmentType: employmentTypeSchema, salary: salarySchema.optional(), applicationDeadline: z.string().optional(),
  publishedAt: z.string(), company: publicJobCompanySchema,
});
export const paginationMetadataSchema = z.object({ page: z.number().int().positive(), limit: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() });
export const searchFacetSchema = z.object({ value: z.string(), count: z.number().int().nonnegative() });
export const publicJobSearchResponseSchema = z.object({ items: z.array(publicJobListItemSchema), pagination: paginationMetadataSchema, facets: z.object({ workMode: z.array(searchFacetSchema), employmentType: z.array(searchFacetSchema) }) });
export const jobAutocompleteResponseSchema = z.object({ suggestions: z.array(z.object({ type: z.enum(['JOB_TITLE', 'SKILL']), value: z.string() })) });
export const publicJobSearchQuerySchema = z.object({
  q: z.string().optional(), city: z.string().optional(), state: z.string().optional(), country: z.string().optional(),
  workMode: workModeSchema.optional(), employmentType: employmentTypeSchema.optional(), skills: z.string().optional(),
  salaryMin: z.string().optional(), salaryMax: z.string().optional(), currency: z.string().optional(), salaryPeriod: salaryPeriodSchema.optional(),
  company: z.string().optional(), postedWithin: z.enum(['24h', '7d', '30d']).optional(), sort: z.enum(['newest', 'oldest', 'relevance']).optional(),
  page: z.string().optional(), limit: z.string().optional(),
});
export type PublicJobListItem = z.infer<typeof publicJobListItemSchema>;
export type PublicJobSearchResponse = z.infer<typeof publicJobSearchResponseSchema>;
export type JobAutocompleteResponse = z.infer<typeof jobAutocompleteResponseSchema>;
export type PublicJobSearchQuery = z.infer<typeof publicJobSearchQuerySchema>;
