import mongoose from 'mongoose';
import { env } from './env';

const RETRY_DELAY_MS = 5000;

const STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function getDbStatus(): string {
  return STATES[mongoose.connection.readyState] ?? 'unknown';
}

/**
 * Connects to MongoDB Atlas using MONGODB_URI.
 * Retries on failure so the API stays up (and /health reports the DB state)
 * even if Atlas is briefly unreachable.
 */
export async function connectDB(): Promise<void> {
  if (!env.mongodbUri) {
    console.error('[db] MONGODB_URI is not set. Add it to .env (see .env.example).');
    return;
  }

  mongoose.connection.on('connected', () => {
    console.log(`[db] Connected to MongoDB Atlas (database: ${mongoose.connection.name})`);
  });
  mongoose.connection.on('disconnected', () => console.warn('[db] Disconnected from MongoDB'));
  mongoose.connection.on('error', (err) => console.error('[db] Connection error:', err.message));

  const tryConnect = async (): Promise<void> => {
    try {
      await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
    } catch (err) {
      console.error(`[db] Initial connection failed: ${(err as Error).message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      setTimeout(tryConnect, RETRY_DELAY_MS);
    }
  };

  await tryConnect();
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
}
