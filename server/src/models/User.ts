import { Schema, model, type HydratedDocument } from 'mongoose';

export type UserRole = 'user' | 'admin';

/** 3–30 chars: letters, digits, dot, underscore. Stored lower-case (case-insensitive unique). */
export const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

export interface IUser {
  name: string;
  username?: string; // optional only for accounts created before usernames existed
  email: string;
  password: string; // bcrypt hash — never the plain-text password (select: false)
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      match: USERNAME_RE,
      // Unique among users that have one; older accounts without a username are allowed.
      index: { unique: true, partialFilterExpression: { username: { $type: 'string' } } },
    },
    email: {
      type: String,
      required: true,
      unique: true, // creates a unique index in MongoDB
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // select: false → the hash is never returned by queries unless explicitly requested.
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  {
    timestamps: true,
    toJSON: {
      // Shape returned to clients: id instead of _id, and never the password hash.
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  },
);

export const User = model<IUser>('User', userSchema);
