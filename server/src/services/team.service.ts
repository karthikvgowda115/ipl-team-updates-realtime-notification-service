import { Types } from 'mongoose';
import { TEAM_FIELDS, TEAM_FIELD_LABELS, Team, type TeamDocument, type TeamField } from '../models/Team';
import { Subscription } from '../models/Subscription';
import { HttpError } from '../types/errors';

export interface TeamView extends Record<string, unknown> {
  id: string;
  followers: number;
  following: boolean;
  fields: TeamField[] | null; // fields you're notified about; null when not following
}

/** The selectable notification fields, in display order. */
export const FIELD_OPTIONS = TEAM_FIELDS.map((key) => ({ key, label: TEAM_FIELD_LABELS[key] }));

/** All teams (points table order) with follower counts and whether `userId` follows each. */
export async function listTeams(userId: Types.ObjectId): Promise<TeamView[]> {
  const [teams, counts, mine] = await Promise.all([
    Team.find().sort({ points: -1, wins: -1, name: 1 }),
    Subscription.aggregate<{ _id: Types.ObjectId; n: number }>([{ $group: { _id: '$team', n: { $sum: 1 } } }]),
    Subscription.find({ user: userId }).select('team fields').lean(),
  ]);

  const countByTeam = new Map(counts.map((c) => [String(c._id), c.n]));
  const fieldsByTeam = new Map(mine.map((s) => [String(s.team), s.fields]));

  return teams.map((t) => ({
    ...(t.toJSON() as Record<string, unknown>),
    id: t.id,
    followers: countByTeam.get(t.id) ?? 0,
    following: fieldsByTeam.has(t.id),
    fields: fieldsByTeam.get(t.id) ?? null,
  }));
}

const TEXT_FIELDS = ['name', 'captain', 'headCoach', 'homeGround'] as const;
const COUNT_FIELDS = ['titles', 'wins', 'losses', 'points'] as const;

/**
 * Validates an admin update body. Only TEAM_FIELDS are allowed; text fields must be
 * 1–100 chars, counts whole numbers 0–1000. Throws 400 with per-field errors.
 */
export function parseTeamUpdate(body: unknown): Partial<Record<TeamField, string | number>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Body must be a JSON object');
  const input = body as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const update: Partial<Record<TeamField, string | number>> = {};

  for (const [key, value] of Object.entries(input)) {
    if ((TEXT_FIELDS as readonly string[]).includes(key)) {
      const v = typeof value === 'string' ? value.trim() : '';
      if (!v || v.length > 100) errors[key] = 'Must be text, 1–100 characters';
      else update[key as TeamField] = v;
    } else if ((COUNT_FIELDS as readonly string[]).includes(key)) {
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1000) {
        errors[key] = 'Must be a whole number from 0 to 1000';
      } else update[key as TeamField] = value as number;
    } else {
      errors[key] = key === 'short' ? 'The short code cannot be changed' : `Unknown field. Allowed: ${TEAM_FIELDS.join(', ')}`;
    }
  }
  if (Object.keys(errors).length > 0) throw new HttpError(400, 'Invalid team update', errors);
  if (Object.keys(update).length === 0) throw new HttpError(400, `Send at least one of: ${TEAM_FIELDS.join(', ')}`);
  return update;
}

/**
 * Admin update. Writes only the fields whose value actually changes, in ONE MongoDB
 * update — so the Change Stream sees one event and followers get ONE grouped notification.
 * Notifications are NOT created here: the Change Stream creates them for API, script and
 * mongosh changes alike (a single path, so nothing is ever notified twice).
 */
export async function updateTeam(teamRef: string, body: unknown) {
  const update = parseTeamUpdate(body);
  const team = await getTeamByRef(teamRef);
  const changed = TEAM_FIELDS.filter((f) => f in update && team.get(f) !== update[f]);
  if (changed.length === 0) return { team, changed };

  const $set = Object.fromEntries(changed.map((f) => [f, update[f]]));
  try {
    const updated = await Team.findOneAndUpdate({ _id: team._id }, { $set }, { new: true, runValidators: true });
    return { team: updated ?? team, changed };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, 'Another team already has that name', { name: 'Already used' });
    throw err;
  }
}

/**
 * Finds a team by its MongoDB id OR its short code (case-insensitive, e.g. "rcb"), or throws.
 * 400 for an empty/oversized reference, 404 if no team matches.
 */
export async function getTeamByRef(ref: unknown): Promise<TeamDocument> {
  const value = typeof ref === 'string' ? ref.trim() : '';
  if (!value || value.length > 24) throw new HttpError(400, 'A team id or short code is required');
  const team = Types.ObjectId.isValid(value) && value.length === 24
    ? await Team.findById(value)
    : await Team.findOne({ short: value.toUpperCase() });
  if (!team) throw new HttpError(404, `Team "${value}" not found`);
  return team;
}
