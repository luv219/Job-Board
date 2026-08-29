import { z } from 'zod';

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
}).superRefine((environment, context) => {
  if (/replace|change-me|placeholder|example/i.test(environment.ACCESS_TOKEN_SECRET)) {
    context.addIssue({ code: 'custom', path: ['ACCESS_TOKEN_SECRET'], message: 'must be replaced with a strong secret' });
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
