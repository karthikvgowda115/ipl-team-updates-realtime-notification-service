import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../types/errors';
import { getCurrentScore, startNewMatch } from '../simulator/matchSimulator';

/** GET /api/matches/current → 200 { live, match } (both null if no match has been played yet) */
export async function getCurrent(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(await getCurrentScore());
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/matches/start  (admin)  { teams?: ["RCB", "CSK"], overs?: 20 }
 * → 201 { match }. Replaces the running match; random teams if none given.
 */
export async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.body ?? {}) as { teams?: unknown; overs?: unknown };
    let teams: [string, string] | undefined;
    if (body.teams !== undefined) {
      if (!Array.isArray(body.teams) || body.teams.length !== 2 || !body.teams.every((t) => typeof t === 'string')) {
        throw new HttpError(400, '"teams" must be two team short codes, e.g. ["RCB", "CSK"]');
      }
      teams = body.teams as [string, string];
    }
    let overs: number | undefined;
    if (body.overs !== undefined) {
      if (!Number.isInteger(body.overs) || (body.overs as number) < 1 || (body.overs as number) > 20) {
        throw new HttpError(400, '"overs" must be a whole number from 1 to 20');
      }
      overs = body.overs as number;
    }
    res.status(201).json({ match: await startNewMatch(teams, overs) });
  } catch (err) {
    next(err);
  }
}
