import type { AnyBulkWriteOperation } from 'mongoose';
import { Team, type ITeam } from '../models/Team';
import { TEAMS, type TeamSeed } from './teams.data';

export interface SeedResult {
  inserted: number;
  updated: number;
  unchanged: number;
}

/**
 * Seeds the 10 IPL teams, matched by `short`.
 * - Default: inserts only missing teams; existing teams are left untouched, so
 *   re-running never overwrites data changed by admins.
 * - reset: true → also restores existing teams to the seed values.
 *
 * Only real changes are written (no blanket upserts, timestamps set by hand), so
 * re-seeding doesn't produce no-op updates that a Change Stream would see as team changes.
 */
export async function seedTeams({ reset = false } = {}): Promise<SeedResult> {
  const existing = new Map(
    (await Team.find({ short: { $in: TEAMS.map((t) => t.short) } }).lean()).map((t) => [t.short, t]),
  );
  const now = new Date();
  const ops: AnyBulkWriteOperation<ITeam>[] = [];
  let inserted = 0;
  let updated = 0;

  for (const seed of TEAMS) {
    const current = existing.get(seed.short);
    if (!current) {
      ops.push({ insertOne: { document: { ...seed, createdAt: now, updatedAt: now } } });
      inserted++;
      continue;
    }
    if (!reset) continue;

    const changes: Partial<TeamSeed> = {};
    for (const key of Object.keys(seed) as (keyof TeamSeed)[]) {
      if (current[key] !== seed[key]) (changes as Record<string, unknown>)[key] = seed[key];
    }
    if (Object.keys(changes).length > 0) {
      ops.push({
        updateOne: { filter: { _id: current._id }, update: { $set: { ...changes, updatedAt: now } }, timestamps: false },
      });
      updated++;
    }
  }

  if (ops.length > 0) await Team.bulkWrite(ops, { ordered: false, timestamps: false });
  return { inserted, updated, unchanged: TEAMS.length - inserted - updated };
}

/** Called on server start: seeds only when the teams collection is empty. */
export async function seedTeamsIfEmpty(): Promise<void> {
  if ((await Team.estimatedDocumentCount()) > 0) return;
  const r = await seedTeams();
  console.log(`[seed] Teams collection was empty — inserted ${r.inserted} IPL teams`);
}
