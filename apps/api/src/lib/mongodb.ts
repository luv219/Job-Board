import mongoose from 'mongoose';
import type { Logger } from 'pino';

let connectionAttempt: Promise<void> | undefined;
let eventsRegistered = false;

function registerConnectionEvents(logger: Logger): void {
  if (eventsRegistered) return;
  eventsRegistered = true;
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (error: unknown) => {
    logger.error({ errorName: error instanceof Error ? error.name : 'unknown' }, 'MongoDB connection error');
  });
}

export async function connectMongo(uri: string, logger: Logger): Promise<void> {
  if (isMongoReady()) return;
  if (connectionAttempt) return connectionAttempt;
  registerConnectionEvents(logger);
  connectionAttempt = mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
    .then(() => undefined)
    .catch((error: unknown) => {
      logger.error({ errorName: error instanceof Error ? error.name : 'unknown' }, 'MongoDB connection failed');
      throw error;
    })
    .finally(() => { connectionAttempt = undefined; });
  return connectionAttempt;
}

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await mongoose.disconnect();
  }
}
