import http from 'node:http';
import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { connectMongo, disconnectMongo, isMongoReady } from './lib/mongodb.js';

const environment = loadEnvironment();
const logger = createLogger(environment);
const app = createApp({ environment, logger, isDatabaseReady: isMongoReady });
const server = http.createServer(app);
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutdown started');
  const timeout = setTimeout(() => {
    logger.error('Shutdown timed out');
    process.exit(1);
  }, 10_000);
  timeout.unref();

  server.close(async () => {
    try {
      await disconnectMongo(logger);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Shutdown failed');
      process.exit(1);
    }
  });
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

server.listen(environment.API_PORT, () => {
  logger.info({ port: environment.API_PORT }, 'API listening');
  void connectMongo(environment.MONGODB_URI, logger).catch(() => {
    logger.warn('API remains live but is not ready until MongoDB becomes available');
  });
});
