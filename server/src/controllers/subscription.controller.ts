import type { NextFunction, Request, Response } from 'express';
import { getTeamByRef } from '../services/team.service';
import {
  followTeam,
  listSubscriptions,
  parseFields,
  unfollowTeam,
  updateSubscriptionFields,
} from '../services/subscription.service';

/**
 * The team a subscription request is about. The same handlers serve both URL styles:
 *   /api/teams/:short/follow          (team in the path, by short code or id)
 *   /api/subscriptions[/:teamId]      (team id/short in the path, or `teamId` in the POST body)
 */
function teamRef(req: Request): unknown {
  return req.params.short ?? req.params.teamId ?? (req.body as { teamId?: unknown } | undefined)?.teamId;
}

/**
 * POST /api/teams/:short/follow  { fields? }   or   POST /api/subscriptions  { teamId, fields? }
 * → 201 (new) | 200 (already following) { following, subscription }
 */
export async function follow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.body ?? {}) as { fields?: unknown };
    const fields = body.fields === undefined ? undefined : parseFields(body.fields);
    const team = await getTeamByRef(teamRef(req));
    const { subscription, created } = await followTeam(req.user!._id, team, fields);
    res.status(created ? 201 : 200).json({
      message: created ? `You are now following ${team.short}` : `You already follow ${team.short}`,
      following: true,
      subscription: subscription.toJSON(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/teams/:short/follow  or  PATCH /api/subscriptions/:teamId   { fields: ["captain", "points"] }
 * → 200 { subscription }. 400 empty/unknown fields · 404 not following.
 */
export async function updateFields(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const fields = parseFields((req.body ?? {}).fields);
    const team = await getTeamByRef(teamRef(req));
    const subscription = await updateSubscriptionFields(req.user!._id, team, fields);
    res.status(200).json({ message: `Notification fields updated for ${team.short}`, subscription: subscription.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/teams/:short/follow  or  DELETE /api/subscriptions/:teamId → 200 { following: false } (idempotent) */
export async function unfollow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await getTeamByRef(teamRef(req));
    const removed = await unfollowTeam(req.user!._id, team);
    res.status(200).json({
      message: removed ? `You unfollowed ${team.short}` : `You were not following ${team.short}`,
      following: false,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/subscriptions → 200 { subscriptions: [{ id, team: {...}, fields, createdAt }] } */
export async function getMySubscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const subscriptions = await listSubscriptions(req.user!._id);
    res.status(200).json({ subscriptions });
  } catch (err) {
    next(err);
  }
}
