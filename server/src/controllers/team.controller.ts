import type { NextFunction, Request, Response } from 'express';
import { Subscription } from '../models/Subscription';
import { FIELD_OPTIONS, getTeamByRef, listTeams, updateTeam } from '../services/team.service';

/**
 * PATCH /api/admin/teams/:id  (also PATCH /api/teams/:short) — admin only.
 * Body: any of { name, captain, headCoach, homeGround, titles, wins, losses, points } in ONE request.
 * → 200 { team, changed: ["captain", "wins"] }. Followers are notified via the Change Stream.
 */
export async function patchTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { team, changed } = await updateTeam(req.params.id ?? req.params.short, req.body);
    res.status(200).json({
      message: changed.length
        ? `${team.short} updated (${changed.join(', ')}). Followers are being notified.`
        : 'Nothing changed — all values were already set.',
      team: team.toJSON(),
      changed,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/teams (and GET /api/admin/teams)
 * → 200 { teams: [...with followers, following, fields], fieldOptions: [{ key, label }] }
 */
export async function getTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const teams = await listTeams(req.user!._id);
    res.status(200).json({ teams, fieldOptions: FIELD_OPTIONS });
  } catch (err) {
    next(err);
  }
}

/** GET /api/teams/:id → 200 { team }. `:id` is the team's id or short code (e.g. RCB). */
export async function getTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await getTeamByRef(req.params.id);
    const [followers, mine] = await Promise.all([
      Subscription.countDocuments({ team: team._id }),
      Subscription.findOne({ team: team._id, user: req.user!._id }).select('fields').lean(),
    ]);
    res.status(200).json({ team: { ...team.toJSON(), followers, following: !!mine, fields: mine?.fields ?? null } });
  } catch (err) {
    next(err);
  }
}
