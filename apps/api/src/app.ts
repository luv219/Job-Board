import express from 'express';
import type { Express, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Environment } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestId } from './middleware/request-id.js';
import { createHealthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createProfileRouter } from './routes/profiles.js';
import { createJobRouter } from './routes/jobs.js';
import { createResumeRouter } from './routes/resumes.js';
import type { ResumeStorageProvider } from './resume/storage/resume-storage-provider.js';

interface AppOptions {
  environment: Environment;
  logger: Logger;
  isDatabaseReady: () => boolean;
  resumeStorageProvider?: ResumeStorageProvider;
  configureRoutes?: (app: Express) => void;
}

export function createApp({ environment, logger, isDatabaseReady, resumeStorageProvider, configureRoutes }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(pinoHttp<Request, Response>({ logger, genReqId: (request) => request.id }));
  app.use(helmet());
  app.use(cors({ origin: environment.WEB_ORIGIN, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], credentials: true }));
  app.use(express.json({ limit: environment.REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: environment.REQUEST_BODY_LIMIT }));
  app.use(cookieParser());
  app.use('/api/v1/health', createHealthRouter(isDatabaseReady));
  app.use('/api/v1/auth', createAuthRouter(environment));
  app.use('/api/v1', createProfileRouter(environment));
  app.use('/api/v1', createResumeRouter(environment, resumeStorageProvider));
  app.use('/api/v1', createJobRouter(environment));
  configureRoutes?.(app);
  app.use(notFoundHandler);
  app.use(errorHandler(environment));
  return app;
}
