import path from 'path';
import dotenv from 'dotenv';

// Local dev: load the root-level .env (one .env shared by client, server and compose).
// In Docker, variables are injected by docker-compose, so a missing file is fine.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // also allow server/.env as a fallback

const PLACEHOLDER_SECRET = 'change-me-to-a-long-random-string';

const jwtSecret = process.env.JWT_SECRET ?? '';
if (!jwtSecret) {
  // Without a secret no token can be signed or verified — refuse to start.
  throw new Error('[env] JWT_SECRET is not set. Add it to .env (see .env.example).');
}
if (jwtSecret === PLACEHOLDER_SECRET || jwtSecret.length < 32) {
  console.warn('[env] JWT_SECRET is weak or still the example value. Use a long random string.');
}

const num = (v: string | undefined, fallback: number, min: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5000),
  mongodbUri: process.env.MONGODB_URI ?? '',
  // Comma-separated list of browser origins allowed by CORS (e.g. Vercel + local Vite).
  clientUrls: (process.env.CLIENT_URL ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  // Admin account ensured on startup (optional). See seed/seedAdmin.ts.
  admin: {
    username: (process.env.ADMIN_USERNAME ?? '').trim().toLowerCase(),
    email: (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD ?? '',
    name: (process.env.ADMIN_NAME ?? '').trim() || 'Admin',
  },

  // Live score match simulator
  simulator: {
    enabled: process.env.SIMULATOR_ENABLED !== 'false',
    overs: Math.min(num(process.env.SIM_OVERS, 20, 1), 50),
    ballIntervalMs: num(process.env.SIM_BALL_INTERVAL_MS, 3000, 200),
    inningsBreakMs: num(process.env.SIM_INNINGS_BREAK_MS, 15000, 0),
    matchBreakMs: num(process.env.SIM_MATCH_BREAK_MS, 60000, 0),
    // When true, a finished match updates the teams' wins/losses/points in MongoDB,
    // which flows through the Change Stream into notifications. Off by default so
    // the simulator never modifies team data unless you opt in.
    updateStandings: process.env.SIM_UPDATE_STANDINGS === 'true',
  },
};
