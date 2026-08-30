import http from 'node:http';
import { createApp } from './app.js';
import { applicationRevision, loadEnvironment } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { checkMongoReadiness, connectMongo, disconnectMongo } from './lib/mongodb.js';
import { createGracefulShutdown } from './lib/graceful-shutdown.js';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const logger = createLogger(environment);
  await connectMongo(environment.MONGODB_URI, logger, environment.NODE_ENV !== 'production');

  const app = createApp({ environment, logger, isDatabaseReady: checkMongoReadiness });
  const server = http.createServer(app);
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;
  const shutdown = createGracefulShutdown({ server, disconnectDatabase: disconnectMongo, logger, timeoutMs: 10_000, finish: (exitCode) => process.exit(exitCode) });

  process.once('SIGINT', () => void shutdown('SIGINT', 0));
  process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
  process.once('uncaughtException', (error) => {
    logger.fatal({ event: 'uncaught_exception', errorName: error.name, ...(environment.NODE_ENV !== 'production' ? { errorStack: error.stack } : {}) }, 'Uncaught exception');
    void shutdown('uncaughtException', 1);
  });
  process.once('unhandledRejection', (reason) => {
    logger.fatal({ event: 'unhandled_rejection', errorName: reason instanceof Error ? reason.name : 'UnknownRejection', ...(environment.NODE_ENV !== 'production' && reason instanceof Error ? { errorStack: reason.stack } : {}) }, 'Unhandled rejection');
    void shutdown('unhandledRejection', 1);
  });

  server.listen(environment.API_PORT, environment.API_HOST, () => {
    logger.info({ event: 'api_started', environment: environment.NODE_ENV, nodeVersion: process.version, applicationVersion: environment.APP_VERSION ?? '0.1.0', revision: applicationRevision(environment), port: environment.API_PORT, searchMode: environment.JOB_SEARCH_MODE ?? 'basic' }, 'API listening');
  });
}

void main().catch((error: unknown) => {
  const logger = createLogger({ NODE_ENV: process.env.NODE_ENV === 'production' ? 'production' : 'development', LOG_LEVEL: 'error' });
  logger.fatal({ errorName: error instanceof Error ? error.name : 'unknown' }, 'API startup failed');
  process.exitCode = 1;
});
