import http from 'node:http';
import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { connectMongo, disconnectMongo, isMongoReady } from './lib/mongodb.js';

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const logger = createLogger(environment);
  await connectMongo(environment.MONGODB_URI, logger);

  const app = createApp({ environment, logger, isDatabaseReady: isMongoReady });
  const server = http.createServer(app);
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;
  let shuttingDown = false;

  const shutdown = async (reason: string, exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'Shutdown started');
    const timeout = setTimeout(() => {
      logger.error('Shutdown timed out');
      server.closeAllConnections();
      process.exit(1);
    }, 10_000);
    timeout.unref();

    try {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await disconnectMongo();
      clearTimeout(timeout);
      logger.info('Shutdown complete');
      process.exit(exitCode);
    } catch (error) {
      logger.error({ err: error }, 'Shutdown failed');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT', 0));
  process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
  process.once('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException', 1);
  });
  process.once('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled rejection');
    void shutdown('unhandledRejection', 1);
  });

  server.listen(environment.API_PORT, environment.API_HOST, () => {
    logger.info({ host: environment.API_HOST, port: environment.API_PORT }, 'API listening');
  });
}

void main().catch((error: unknown) => {
  const logger = createLogger({ NODE_ENV: process.env.NODE_ENV === 'production' ? 'production' : 'development', LOG_LEVEL: 'error' });
  logger.fatal({ errorName: error instanceof Error ? error.name : 'unknown' }, 'API startup failed');
  process.exitCode = 1;
});
