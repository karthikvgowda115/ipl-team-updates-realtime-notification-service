/**
 * CLI: seed the 10 IPL teams into MongoDB Atlas (and the admin from ADMIN_EMAIL/ADMIN_PASSWORD, if set).
 *   npm run seed            → insert missing teams only (safe to re-run)
 *   npm run seed -- --reset → overwrite all teams with the seed values
 * In Docker: docker compose exec server npm run seed:prod [-- --reset]
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { seedTeams } from './seedTeams';
import { ensureAdminFromEnv } from './seedAdmin';

async function main(): Promise<void> {
  if (!env.mongodbUri) throw new Error('MONGODB_URI is not set');
  const reset = process.argv.includes('--reset');

  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`[seed] Connected (database: ${mongoose.connection.name})`);

  const r = await seedTeams({ reset });
  console.log(
    `[seed] Teams ${reset ? '(reset) ' : ''}— inserted: ${r.inserted}, updated: ${r.updated}, unchanged: ${r.unchanged}`,
  );
  console.log(`[seed] Admin from .env: ${await ensureAdminFromEnv()}`);
}

main()
  .catch((err: Error) => {
    console.error('[seed] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
