import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // One in-memory MongoDB replica set (needed for Change Streams) for the whole run.
    globalSetup: ['tests/setup/globalSetup.ts'],
    // Sets test env vars BEFORE any app module (config/env.ts) is imported.
    setupFiles: ['tests/setup/env.ts'],
    // Files share the replica set and each starts a server with module-level state
    // (WebSocket registry, change stream): run them one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000, // first run downloads the mongod binary
  },
});
