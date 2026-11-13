import { env } from '../config/env';
import { USERNAME_RE, User } from '../models/User';
import { registerUser, validateRegisterInput } from '../services/auth.service';
import { HttpError } from '../types/errors';

export const EXAMPLE_ADMIN_PASSWORD = 'change-me-admin-password';

export type AdminSeedResult = 'skipped' | 'created' | 'promoted' | 'exists' | 'invalid';

/** Username from an email's local part, e.g. "Site.Admin+x@corp.com" → "site.adminx". */
function usernameFromEmail(email: string): string {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '');
  return (base.length >= 3 ? base : `${base}admin`).slice(0, 30);
}

/**
 * Makes sure the admin account from .env exists:
 *   ADMIN_USERNAME and/or ADMIN_EMAIL (at least one), ADMIN_PASSWORD, optional ADMIN_NAME.
 * - No matching user        → created with role "admin" (same validation + bcrypt as signup).
 *   A missing email defaults to "<username>@admin.local"; a missing username comes from the email.
 * - Matching user (by username or email) → promoted to admin. Their password is NOT changed.
 * - Already admin           → nothing to do.
 * The password is never logged. Runs on server start and with `npm run seed`.
 * Other admins can be added any time with `npm run make-admin -- <email|username>`.
 */
export async function ensureAdminFromEnv(): Promise<AdminSeedResult> {
  const { password, name } = env.admin;
  const username = env.admin.username || (env.admin.email ? usernameFromEmail(env.admin.email) : '');
  const email = env.admin.email || (username ? `${username}@admin.local` : '');

  if (!username && !password) {
    console.log('[admin] No ADMIN_USERNAME/ADMIN_PASSWORD in .env — no admin created. Use `npm run make-admin -- <email>` to promote a user.');
    return 'skipped';
  }
  if (!username || !password) {
    console.warn('[admin] Set ADMIN_USERNAME (or ADMIN_EMAIL) AND ADMIN_PASSWORD in .env to create the admin account.');
    return 'invalid';
  }
  if (password === EXAMPLE_ADMIN_PASSWORD) {
    console.warn('[admin] ADMIN_PASSWORD is still the example value. Choose your own password in .env — admin not created.');
    return 'invalid';
  }
  if (!USERNAME_RE.test(username)) {
    console.warn('[admin] ADMIN_USERNAME must be 3–30 characters: letters, numbers, dots or underscores.');
    return 'invalid';
  }

  const existing = await User.findOne({ $or: [{ username }, { email }] });
  if (existing) {
    if (existing.role === 'admin') return 'exists';
    existing.role = 'admin';
    await existing.save();
    console.log(`[admin] ${existing.username ?? existing.email} already had an account — promoted to admin (password unchanged).`);
    return 'promoted';
  }

  try {
    const input = validateRegisterInput({ name, username, email, password }); // same rules as signup
    await registerUser(input, 'admin');
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) return 'exists'; // created concurrently
    if (err instanceof HttpError && err.fieldErrors) {
      console.warn(`[admin] ADMIN_* settings are invalid: ${Object.values(err.fieldErrors).join(' ')}`);
      return 'invalid';
    }
    throw err;
  }
  console.log(`[admin] Admin account created: ${username}`);
  return 'created';
}
