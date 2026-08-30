import mongoose from 'mongoose';
import type { Logger } from 'pino';

let connectionAttempt: Promise<void> | undefined;
let eventsRegistered = false;

function registerConnectionEvents(logger: Logger): void {
  if (eventsRegistered) return;
  eventsRegistered = true;
  mongoose.connection.on('connected', () => logger.info({ event: 'database_connected' }, 'MongoDB connected'));
  mongoose.connection.on('reconnected', () => logger.info({ event: 'database_reconnected' }, 'MongoDB reconnected'));
  mongoose.connection.on('disconnected', () => logger.warn({ event: 'database_disconnected' }, 'MongoDB disconnected'));
  mongoose.connection.on('error', (error: unknown) => {
    logger.error({ event: 'database_error', errorName: error instanceof Error ? error.name : 'UnknownError' }, 'MongoDB connection error');
  });
}

export async function connectMongo(uri: string, logger: Logger, autoIndex = true): Promise<void> {
  if (isMongoReady()) return;
  if (connectionAttempt) return connectionAttempt;
  registerConnectionEvents(logger);
  mongoose.set('autoIndex', autoIndex);
  logger.info({ event: 'database_connection_attempt' }, 'MongoDB connection attempt started');
  connectionAttempt = mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
    .then(() => undefined)
    .catch((error: unknown) => {
      logger.error({ event: 'database_connection_failed', errorName: error instanceof Error ? error.name : 'UnknownError' }, 'MongoDB connection failed');
      throw error;
    })
    .finally(() => { connectionAttempt = undefined; });
  return connectionAttempt;
}

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function checkMongoReadiness(timeoutMs = 1_000): Promise<boolean> {
  if (!isMongoReady() || !mongoose.connection.db) return false;
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('MongoDB readiness check timed out')), timeoutMs); }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await mongoose.disconnect();
  }
}
