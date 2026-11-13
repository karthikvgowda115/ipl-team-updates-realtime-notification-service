/**
 * CLI: change a team DIRECTLY in MongoDB (bypassing the API), to demonstrate that
 * script/mongosh changes notify subscribers too (the server's Change Stream picks it up).
 *
 *   npm run update-team -- RCB captain="Virat Kohli" wins=10 points=20
 *   docker compose exec server npm run update-team:prod -- RCB wins=10
 *
 * Numbers are stored as numbers, everything else as text. All fields go into ONE
 * updateOne → ONE change event → ONE grouped notification per follower.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { TEAM_FIELDS, Team } from '../models/Team';

const NUMERIC = new Set(['titles', 'wins', 'losses', 'points']);

async function main(): Promise<void> {
  const [short, ...pairs] = process.argv.slice(2);
  if (!short || pairs.length === 0) {
    throw new Error('Usage: npm run update-team -- <SHORT> field=value [field=value ...]');
  }

  const $set: Record<string, string | number> = {};
  for (const pair of pairs) {
    const i = pair.indexOf('=');
    const field = pair.slice(0, i);
    const raw = pair.slice(i + 1);
    if (i < 1 || !(TEAM_FIELDS as readonly string[]).includes(field)) {
      throw new Error(`Bad argument "${pair}". Fields: ${TEAM_FIELDS.join(', ')}`);
    }
    if (NUMERIC.has(field)) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error(`${field} must be a whole number ≥ 0`);
      $set[field] = n;
    } else {
      $set[field] = raw;
    }
  }

  if (!env.mongodbUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 15000 });
  // Raw driver call on purpose: no Mongoose middleware, exactly like a script or mongosh.
  const res = await Team.collection.updateOne({ short: short.toUpperCase() }, { $set });
  if (res.matchedCount === 0) throw new Error(`Team "${short}" not found`);
  console.log(
    res.modifiedCount
      ? `[update-team] ${short.toUpperCase()} updated: ${JSON.stringify($set)}. Followers will be notified by the running server.`
      : `[update-team] ${short.toUpperCase()}: values were already set, nothing changed.`,
  );
}

main()
  .catch((err: Error) => {
    console.error('[update-team] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
