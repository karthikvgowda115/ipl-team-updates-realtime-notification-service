import { Request, Response } from 'express';
import { getDbStatus } from '../config/db';
import { isTeamChangeStreamReady } from '../change-stream/teamChangeStream';

export function getHealth(_req: Request, res: Response): void {
  const database = getDbStatus();
  res.status(200).json({
    status: 'ok',
    service: 'ipl-team-updates-server',
    database,
    changeStream: isTeamChangeStreamReady() ? 'watching' : 'not running',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
