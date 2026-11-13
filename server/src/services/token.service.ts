import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserRole } from '../models/User';

/** Claims stored inside the JWT. Kept minimal: the user is re-loaded from the DB on each request. */
export interface TokenPayload {
  sub: string; // user id
  role: UserRole;
  exp?: number; // expiry (seconds since epoch), set by jsonwebtoken
}

export function signToken(userId: string, role: UserRole): string {
  const payload: TokenPayload = { sub: userId, role };
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/** Returns the payload, or null if the token is missing/invalid/expired. */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') return null;
    return { sub: decoded.sub, role: decoded.role as UserRole, exp: decoded.exp };
  } catch {
    return null;
  }
}
