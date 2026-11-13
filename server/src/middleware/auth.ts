import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { verifyToken } from '../services/token.service';
import { HttpError } from '../types/errors';

/**
 * Requires `Authorization: Bearer <jwt>`. Verifies the token, loads the user and
 * attaches it as `req.user`. 401 if the token is missing, invalid, expired, or the
 * user no longer exists.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'Authentication required');
    }

    const payload = verifyToken(token);
    if (!payload || !mongoose.isValidObjectId(payload.sub)) {
      throw new HttpError(401, 'Invalid or expired token');
    }

    if (mongoose.connection.readyState !== 1) {
      throw new HttpError(503, 'Database is not available. Please try again shortly.');
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      throw new HttpError(401, 'Account no longer exists');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Use after requireAuth: allows only the given roles (e.g. admin-only routes later). */
export function requireRole(...roles: Array<'user' | 'admin'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, 'You do not have permission to do this'));
      return;
    }
    next();
  };
}
