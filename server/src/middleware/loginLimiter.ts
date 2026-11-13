import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../types/errors';

/**
 * Brute-force protection for POST /api/auth/login: at most MAX_FAILURES failed attempts per
 * (client IP + username/email) per WINDOW_MS; further attempts get 429 until the window ends.
 * Only failures count, and a successful login clears the counter. In-memory (single server
 * instance, like the simulator); entries expire, so memory stays bounded.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
}, 60_000);
sweep.unref(); // never keeps the process (or a test run) alive

function keyFor(req: Request): string {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const who = [b.identifier, b.username, b.email].find((v) => typeof v === 'string') as string | undefined;
  return `${req.ip}|${(who ?? '').trim().toLowerCase()}`;
}

export function loginLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = keyFor(req);
  const entry = failures.get(key);
  const now = Date.now();
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
    res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    next(new HttpError(429, 'Too many failed login attempts. Please try again later.'));
    return;
  }

  res.on('finish', () => {
    if (res.statusCode === 401) {
      const cur = failures.get(key);
      if (!cur || cur.resetAt <= Date.now()) failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
      else cur.count += 1;
    } else if (res.statusCode === 200) {
      failures.delete(key);
    }
  });
  next();
}
