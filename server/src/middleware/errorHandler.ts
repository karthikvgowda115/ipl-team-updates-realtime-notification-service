import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../types/errors';

/** 404 for any route that wasn't matched. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ message: 'Not found' });
}

/** Central error handler: HttpError → its status; anything else → 500 (details logged, not leaked). */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, errors: err.fieldErrors });
    return;
  }
  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ message: 'Invalid JSON body' });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
}
