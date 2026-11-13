import { inject } from 'vitest';

// Runs before each test file imports the app. dotenv never overrides variables that are
// already set, so the real .env (Atlas URI, admin settings) can't leak into tests.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = inject('mongoUri');
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing-0123456789';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.ADMIN_EMAIL = '';
process.env.ADMIN_USERNAME = '';
process.env.ADMIN_PASSWORD = '';
process.env.SIMULATOR_ENABLED = 'false';
process.env.SIM_BALL_INTERVAL_MS = '200';
process.env.SIM_INNINGS_BREAK_MS = '200';
process.env.SIM_MATCH_BREAK_MS = '60000';
process.env.SIM_UPDATE_STANDINGS = 'false';
