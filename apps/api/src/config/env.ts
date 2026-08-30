import { z } from 'zod';

const optionalValue = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).max(512).optional(),
);
const optionalEmail = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().email().max(320).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().trim().min(1).max(253).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
  MONGODB_URI: z.string().trim().url().startsWith('mongodb'),
  WEB_ORIGIN: z.string().trim().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SLOW_REQUEST_THRESHOLD_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  APP_VERSION: optionalValue,
  APP_REVISION: optionalValue,
  GIT_SHA: optionalValue,
  VERCEL_GIT_COMMIT_SHA: optionalValue,
  BUILD_ID: optionalValue,
  REQUEST_BODY_LIMIT: z.coerce.number().int().positive().max(1_048_576).default(102_400),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
  ACCESS_TOKEN_SECRET: z.string().trim().min(32),
  ACCESS_TOKEN_ISSUER: z.string().trim().min(1).default('job-board-api'),
  ACCESS_TOKEN_AUDIENCE: z.string().trim().min(1).default('job-board-web'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(900).default(600),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  CLOUDINARY_CLOUD_NAME: optionalValue,
  CLOUDINARY_API_KEY: optionalValue,
  CLOUDINARY_API_SECRET: optionalValue,
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).optional(),
  EMAIL_FROM: optionalEmail,
  SMTP_HOST: optionalValue,
  SMTP_PORT: z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, z.coerce.number().int().min(1).max(65_535).optional()),
  SMTP_USER: optionalValue,
  SMTP_PASSWORD: optionalValue,
  SMTP_SECURE: z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, z.enum(['true', 'false']).transform((value) => value === 'true').optional()),
  JOB_SEARCH_MODE: z.enum(['basic', 'atlas']).optional(),
  ATLAS_SEARCH_INDEX: optionalValue,
}).superRefine((environment, context) => {
  if (/replace|change-me|placeholder|example/i.test(environment.ACCESS_TOKEN_SECRET)) {
    context.addIssue({ code: 'custom', path: ['ACCESS_TOKEN_SECRET'], message: 'must be replaced with a strong secret' });
  }
  if (environment.NODE_ENV === 'production') {
    if (!environment.JOB_SEARCH_MODE) context.addIssue({ code: 'custom', path: ['JOB_SEARCH_MODE'], message: 'must explicitly be basic or atlas in production' });
    if (environment.JOB_SEARCH_MODE === 'atlas' && !environment.ATLAS_SEARCH_INDEX) context.addIssue({ code: 'custom', path: ['ATLAS_SEARCH_INDEX'], message: 'is required when Atlas Search is enabled' });
    for (const field of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const) {
      if (!environment[field] || /replace|change-me|placeholder|example/i.test(environment[field])) {
        context.addIssue({ code: 'custom', path: [field], message: 'is required for private resume storage in production' });
      }
    }
    if (environment.EMAIL_PROVIDER !== 'smtp') context.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'must be smtp in production' });
    for (const field of ['EMAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'] as const) {
      if (environment[field] === undefined || (typeof environment[field] === 'string' && /replace|change-me|placeholder|example/i.test(environment[field]))) {
        context.addIssue({ code: 'custom', path: [field], message: 'is required for SMTP email delivery in production' });
      }
    }
    if (!environment.WEB_ORIGIN.startsWith('https://')) context.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'must use HTTPS in production' });
  }
});

export type Environment = Omit<z.infer<typeof environmentSchema>, 'JOB_SEARCH_MODE' | 'ATLAS_SEARCH_INDEX' | 'TRUST_PROXY_HOPS' | 'SLOW_REQUEST_THRESHOLD_MS' | 'APP_VERSION' | 'APP_REVISION' | 'GIT_SHA' | 'VERCEL_GIT_COMMIT_SHA' | 'BUILD_ID'> & {
  JOB_SEARCH_MODE?: 'basic' | 'atlas' | undefined;
  ATLAS_SEARCH_INDEX?: string | undefined;
  TRUST_PROXY_HOPS?: number | undefined;
  SLOW_REQUEST_THRESHOLD_MS?: number | undefined;
  APP_VERSION?: string | undefined;
  APP_REVISION?: string | undefined;
  GIT_SHA?: string | undefined;
  VERCEL_GIT_COMMIT_SHA?: string | undefined;
  BUILD_ID?: string | undefined;
};

export function applicationRevision(environment: Pick<Environment, 'APP_REVISION' | 'GIT_SHA' | 'VERCEL_GIT_COMMIT_SHA' | 'BUILD_ID'>): string {
  return environment.APP_REVISION ?? environment.GIT_SHA ?? environment.VERCEL_GIT_COMMIT_SHA ?? environment.BUILD_ID ?? 'unknown';
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  return result.data;
}
