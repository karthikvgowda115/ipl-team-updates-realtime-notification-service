import type { UserDocument } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      /** Set by the requireAuth middleware. */
      user?: UserDocument;
    }
  }
}

export {};
