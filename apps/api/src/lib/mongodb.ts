import mongoose from 'mongoose';
import type { Logger } from 'pino';

export async function connectMongo(uri: string, logger: Logger): Promise<void> {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed');
    throw error;
  }
}

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectMongo(logger: Logger): Promise<void> {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}
