import type { Types } from 'mongoose';
import { Subscription, type SubscriptionDocument } from '../models/Subscription';
import { TEAM_FIELDS, isTeamField, type TeamDocument, type TeamField } from '../models/Team';
import { HttpError } from '../types/errors';

/**
 * Validates a `fields` list from a request: a non-empty array of known team fields.
 * Duplicates are removed and the result is in the standard field order.
 */
export function parseFields(input: unknown): TeamField[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new HttpError(400, 'Choose at least one field', { fields: 'Choose at least one field' });
  }
  const unknown = input.filter((f) => !isTeamField(f));
  if (unknown.length > 0) {
    throw new HttpError(400, `Unknown field(s): ${unknown.map(String).join(', ')}`, {
      fields: `Allowed: ${TEAM_FIELDS.join(', ')}`,
    });
  }
  const wanted = new Set(input as TeamField[]);
  return TEAM_FIELDS.filter((f) => wanted.has(f));
}

/**
 * Follows a team. Idempotent: following an already-followed team returns the
 * existing subscription with created = false (its fields are left unchanged).
 * `fields` (optional) sets which fields a NEW subscription notifies about; default all.
 */
export async function followTeam(
  userId: Types.ObjectId,
  team: TeamDocument,
  fields?: TeamField[],
): Promise<{ subscription: SubscriptionDocument; created: boolean }> {
  const existing = await Subscription.findOne({ user: userId, team: team._id });
  if (existing) return { subscription: existing, created: false };

  try {
    const subscription = await Subscription.create({ user: userId, team: team._id, ...(fields ? { fields } : {}) });
    return { subscription, created: true };
  } catch (err) {
    // Race: a parallel request created it first → the unique index rejects ours.
    if ((err as { code?: number }).code === 11000) {
      const subscription = await Subscription.findOne({ user: userId, team: team._id });
      if (subscription) return { subscription, created: false };
    }
    throw err;
  }
}

/** Changes which fields of a followed team the user is notified about. 404 if not following. */
export async function updateSubscriptionFields(
  userId: Types.ObjectId,
  team: TeamDocument,
  fields: TeamField[],
): Promise<SubscriptionDocument> {
  const subscription = await Subscription.findOneAndUpdate(
    { user: userId, team: team._id },
    { $set: { fields } },
    { new: true, runValidators: true },
  );
  if (!subscription) throw new HttpError(404, `You don't follow ${team.short}. Follow it first.`);
  return subscription;
}

/** Unfollows a team. Idempotent: returns false if the user wasn't following it. */
export async function unfollowTeam(userId: Types.ObjectId, team: TeamDocument): Promise<boolean> {
  const res = await Subscription.deleteOne({ user: userId, team: team._id });
  return res.deletedCount > 0;
}

/** The user's subscriptions with team details, newest first. */
export async function listSubscriptions(userId: Types.ObjectId) {
  const subs = await Subscription.find({ user: userId }).sort({ createdAt: -1 }).populate('team');
  // Skip subscriptions whose team was deleted.
  return subs.filter((s) => s.team).map((s) => s.toJSON());
}
