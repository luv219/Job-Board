import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Environment } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestId } from './middleware/request-id.js';
import { createHealthRouter } from './routes/health.js';

interface AppOptions {
  environment: Environment;
  logger: Logger;
  isDatabaseReady: () => boolean;
}

export function createApp({ environment, logger, isDatabaseReady }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(pinoHttp<Request, Response>({ logger, genReqId: (request) => request.id }));
  app.use(helmet());
  app.use(cors({ origin: environment.WEB_ORIGIN, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], credentials: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use('/api/v1/health', createHealthRouter(isDatabaseReady));
  app.use(notFoundHandler);
  app.use(errorHandler(environment));
  return app;
}
