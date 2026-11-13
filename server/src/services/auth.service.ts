import bcrypt from 'bcrypt';
import { USERNAME_RE, User, type UserDocument, type UserRole } from '../models/User';
import { HttpError } from '../types/errors';

const SALT_ROUNDS = 12;

// Compared against when the account doesn't exist, so a login for an unknown user
// takes about as long as a wrong password (doesn't reveal which accounts exist).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', SALT_ROUNDS);

export interface RegisterInput {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  identifier: string; // username or email (lower-cased)
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Validates and normalises the register payload. Throws 400 with per-field messages. */
export function validateRegisterInput(body: unknown): RegisterInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = str(b.name).trim();
  const username = str(b.username).trim().toLowerCase();
  const email = str(b.email).trim().toLowerCase();
  const password = str(b.password);

  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 50) errors.name = 'Name must be 2–50 characters.';
  if (!USERNAME_RE.test(username)) {
    errors.username = 'Username must be 3–30 characters: letters, numbers, dots or underscores.';
  }
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';
  if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (password.length > 72) errors.password = 'Password must be at most 72 characters.'; // bcrypt limit

  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, 'Validation failed', errors);
  }
  return { name, username, email, password };
}

/**
 * Validates the login payload (presence only — strength rules apply at signup).
 * Accepts `identifier` (username or email); `username` or `email` also work.
 */
export function validateLoginInput(body: unknown): LoginInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const identifier = (str(b.identifier) || str(b.username) || str(b.email)).trim().toLowerCase();
  const password = str(b.password);

  const errors: Record<string, string> = {};
  if (!identifier) errors.identifier = 'Enter your username or email.';
  if (!password) errors.password = 'Password is required.';

  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, 'Validation failed', errors);
  }
  return { identifier, password };
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function duplicateError(field: 'email' | 'username'): HttpError {
  return field === 'email'
    ? new HttpError(409, 'An account with this email already exists', { email: 'This email is already registered.' })
    : new HttpError(409, 'That username is taken', { username: 'This username is already taken.' });
}

/**
 * Creates a user with a bcrypt-hashed password. Public signup always creates role "user";
 * only trusted server code (admin seed) passes another role. 409 if email/username is taken.
 */
export async function registerUser(input: RegisterInput, role: UserRole = 'user'): Promise<UserDocument> {
  const existing = await User.findOne({ $or: [{ email: input.email }, { username: input.username }] })
    .select('email username')
    .lean();
  if (existing) throw duplicateError(existing.email === input.email ? 'email' : 'username');

  try {
    return await User.create({
      name: input.name,
      username: input.username,
      email: input.email,
      password: await hashPassword(input.password),
      role,
    });
  } catch (err) {
    // Race: two signups at once → the unique index rejects the second.
    const e = err as { code?: number; keyPattern?: Record<string, unknown> };
    if (e.code === 11000) throw duplicateError(e.keyPattern?.username ? 'username' : 'email');
    throw err;
  }
}

/** Checks username/email + password. Throws a generic 401 so callers can't tell which part was wrong. */
export async function authenticateUser(input: LoginInput): Promise<UserDocument> {
  const query = input.identifier.includes('@') ? { email: input.identifier } : { username: input.identifier };
  const user = await User.findOne(query).select('+password');
  const ok = await bcrypt.compare(input.password, user?.password ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new HttpError(401, 'Invalid username/email or password');
  }
  return user;
}
