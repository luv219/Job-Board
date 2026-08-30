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
import { createApplicationRouter } from './routes/applications.js';
import { createEmployerApplicationRouter } from './routes/employer-applications.js';
import { createSavedJobRouter } from './routes/saved-jobs.js';
import { createApplicantDashboardRouter } from './routes/dashboard.js';
import type { ResumeStorageProvider } from './resume/storage/resume-storage-provider.js';
import type { EmailProvider } from './notifications/email-provider.js';
import { createEmailProvider } from './notifications/create-email-provider.js';
import { EmailNotificationService } from './notifications/email-notification-service.js';
import { privateNoStore } from './middleware/security.js';
import { applicationRevision } from './config/env.js';
import { createOperationalMetrics, type OperationalMetrics } from './lib/metrics.js';
import { requestObservability } from './middleware/observability.js';
import { createMetricsRouter } from './routes/metrics.js';
import { createCompanyTeamRouter } from './routes/company-team.js';

interface AppOptions {
  environment: Environment;
  logger: Logger;
  isDatabaseReady: () => boolean | Promise<boolean>;
  resumeStorageProvider?: ResumeStorageProvider;
  emailProvider?: EmailProvider;
  metrics?: OperationalMetrics;
  configureRoutes?: (app: Express) => void;
}

export function createApp({ environment, logger, isDatabaseReady, resumeStorageProvider, emailProvider, metrics, configureRoutes }: AppOptions) {
  const app = express();
  const operationalMetrics = metrics ?? createOperationalMetrics({
    collectProcessMetrics: environment.NODE_ENV !== 'test', applicationVersion: environment.APP_VERSION ?? '0.1.0',
    environment: environment.NODE_ENV, revision: applicationRevision(environment), searchMode: environment.JOB_SEARCH_MODE ?? 'basic',
  });
  app.set('trust proxy', environment.TRUST_PROXY_HOPS ?? 0);
  const notifications = new EmailNotificationService(emailProvider ?? createEmailProvider(environment, logger), environment, logger, operationalMetrics);
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(pinoHttp<Request, Response>({
    logger,
    autoLogging: false,
    genReqId: (request) => request.id,
    customProps: (request) => ({ requestId: request.id }),
    serializers: { req: () => undefined, res: () => undefined },
  }));
  app.use(requestObservability(operationalMetrics, logger, environment.SLOW_REQUEST_THRESHOLD_MS ?? 1_000));
  app.use(helmet({ contentSecurityPolicy: false, strictTransportSecurity: environment.NODE_ENV === 'production' ? { maxAge: 15_552_000 } : false, referrerPolicy: { policy: 'no-referrer' } }));
  app.use(cors({ origin: environment.WEB_ORIGIN, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], credentials: true }));
  app.use(express.json({ limit: environment.REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: environment.REQUEST_BODY_LIMIT }));
  app.use(cookieParser());
  app.use('/api/v1/health', createHealthRouter(isDatabaseReady));
  app.use('/metrics', createMetricsRouter(operationalMetrics));
  app.use('/api/v1/auth', privateNoStore, createAuthRouter(environment, notifications));
  app.use('/api/v1', createProfileRouter(environment));
  app.use('/api/v1', createCompanyTeamRouter(environment, notifications));
  app.use('/api/v1', createResumeRouter(environment, operationalMetrics, resumeStorageProvider));
  app.use('/api/v1', createApplicationRouter(environment, notifications, operationalMetrics, resumeStorageProvider));
  app.use('/api/v1', createEmployerApplicationRouter(environment, notifications, operationalMetrics, resumeStorageProvider));
  app.use('/api/v1', createSavedJobRouter(environment));
  app.use('/api/v1', createApplicantDashboardRouter(environment));
  app.use('/api/v1', createJobRouter(environment, operationalMetrics));
  configureRoutes?.(app);
  app.use(notFoundHandler);
  app.use(errorHandler(environment));
  return app;
}
