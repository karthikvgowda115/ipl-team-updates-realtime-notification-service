/**
 * CLI: give (or take away) the admin role.
 *   npm run make-admin -- you@example.com     (or a username)
 *   npm run make-admin -- you@example.com --revoke
 * In Docker: docker compose exec server npm run make-admin:prod -- you@example.com
 * The user must have signed up first. They need to log in again to get an admin token.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { User } from '../models/User';

async function main(): Promise<void> {
  const who = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const revoke = process.argv.includes('--revoke');
  if (!who) throw new Error('Usage: npm run make-admin -- <email|username> [--revoke]');
  if (!env.mongodbUri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 15000 });
  const user = await User.findOneAndUpdate(
    who.includes('@') ? { email: who.trim().toLowerCase() } : { username: who.trim().toLowerCase() },
    { $set: { role: revoke ? 'user' : 'admin' } },
    { new: true },
  );
  if (!user) throw new Error(`No user "${who}". Sign up first.`);
  console.log(`[make-admin] ${user.email} is now "${user.role}". Log out and back in to get a new token.`);
}

main()
  .catch((err: Error) => {
    console.error('[make-admin] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
