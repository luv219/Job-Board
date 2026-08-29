import { z } from 'zod';

const optionalValue = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).max(512).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().trim().min(1).max(253).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
  MONGODB_URI: z.string().trim().url().startsWith('mongodb'),
  WEB_ORIGIN: z.string().trim().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REQUEST_BODY_LIMIT: z.coerce.number().int().positive().max(1_048_576).default(102_400),
  ACCESS_TOKEN_SECRET: z.string().trim().min(32),
  ACCESS_TOKEN_ISSUER: z.string().trim().min(1).default('job-board-api'),
  ACCESS_TOKEN_AUDIENCE: z.string().trim().min(1).default('job-board-web'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(900).default(600),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  CLOUDINARY_CLOUD_NAME: optionalValue,
  CLOUDINARY_API_KEY: optionalValue,
  CLOUDINARY_API_SECRET: optionalValue,
}).superRefine((environment, context) => {
  if (/replace|change-me|placeholder|example/i.test(environment.ACCESS_TOKEN_SECRET)) {
    context.addIssue({ code: 'custom', path: ['ACCESS_TOKEN_SECRET'], message: 'must be replaced with a strong secret' });
  }
  if (environment.NODE_ENV === 'production') {
    for (const field of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const) {
      if (!environment[field] || /replace|change-me|placeholder|example/i.test(environment[field])) {
        context.addIssue({ code: 'custom', path: [field], message: 'is required for private resume storage in production' });
      }
    }
  }
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  return result.data;
}
