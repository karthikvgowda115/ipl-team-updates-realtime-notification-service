import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  authenticateUser,
  registerUser,
  validateLoginInput,
  validateRegisterInput,
} from '../services/auth.service';
import { signToken } from '../services/token.service';
import { HttpError } from '../types/errors';

/** Fail fast instead of letting Mongoose buffer the query until it times out. */
function assertDbConnected(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new HttpError(503, 'Database is not available. Please try again shortly.');
  }
}

/** POST /api/auth/register  { name, username, email, password } → 201 { message, token, user } (role is always "user") */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Validate first so bad input gets a 400 even when the DB is down.
    const input = validateRegisterInput(req.body);
    assertDbConnected();
    const user = await registerUser(input);
    // Signing up also logs the user in.
    const token = signToken(user.id, user.role);
    res.status(201).json({ message: 'Account created successfully', token, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/login  { identifier (username or email), password } → 200 { token, user } */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = validateLoginInput(req.body);
    assertDbConnected();
    const user = await authenticateUser(input);
    const token = signToken(user.id, user.role);
    res.status(200).json({ token, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/auth/me (requires Bearer token) → 200 { user } */
export function me(req: Request, res: Response): void {
  res.status(200).json({ user: req.user!.toJSON() });
}
