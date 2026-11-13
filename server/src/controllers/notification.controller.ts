import type { NextFunction, Request, Response } from 'express';
import { countUnread, listNotifications, markAllRead, markRead } from '../services/notification.service';

/**
 * GET /api/notifications?limit=20&before=<id>&unread=true
 * → 200 { notifications, unreadCount, nextCursor }
 */
export async function getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 20;
    const before = typeof req.query.before === 'string' && req.query.before ? req.query.before : undefined;
    const unreadOnly = req.query.unread === 'true';
    res.status(200).json(await listNotifications(req.user!._id, { limit, before, unreadOnly }));
  } catch (err) {
    next(err);
  }
}

/** GET /api/notifications/unread-count → 200 { unreadCount } */
export async function getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json({ unreadCount: await countUnread(req.user!._id) });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/notifications/:id/read → 200 { notification, unreadCount } */
export async function readOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const n = await markRead(req.user!._id, req.params.id);
    res.status(200).json({ notification: n.toJSON(), unreadCount: await countUnread(req.user!._id) });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/notifications/read-all → 200 { updated, unreadCount: 0 } */
export async function readAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updated = await markAllRead(req.user!._id);
    res.status(200).json({ updated, unreadCount: 0 });
  } catch (err) {
    next(err);
  }
}
