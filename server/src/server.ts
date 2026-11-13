import http from 'http';
import mongoose from 'mongoose';
import app from './app';
import { env } from './config/env';
import { connectDB, disconnectDB } from './config/db';
import { seedTeamsIfEmpty } from './seed/seedTeams';
import { ensureAdminFromEnv } from './seed/seedAdmin';
import { initTeamChangeStream, startTeamChangeStream, stopTeamChangeStream } from './change-stream/teamChangeStream';
import { initWebSocket } from './websocket';
import { startSimulator, stopSimulator } from './simulator/matchSimulator';

async function bootstrap(): Promise<void> {
  // One HTTP server for both REST (Express) and WebSocket (upgrade requests on /api/ws).
  const server = http.createServer(app);
  const wss = initWebSocket(server);

  server.listen(env.port, () => {
    console.log(`[server] API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  let initialised = false;
  mongoose.connection.on('connected', () => {
    if (!initialised) {
      initialised = true;
      // First connect: seed teams on an empty DB (so the collection exists), then watch it
      // and start the live match simulator.
      ensureAdminFromEnv().catch((err: Error) => console.error('[admin] Could not create admin:', err.message));
      seedTeamsIfEmpty()
        .catch((err: Error) => console.error('[seed] Auto-seed failed:', err.message))
        .finally(() => {
          void initTeamChangeStream();
          startSimulator().catch((err: Error) => console.error('[simulator] failed to start:', err.message));
        });
    } else {
      // Reconnected after a drop: make sure the watcher is running again (no-op if it is).
      void startTeamChangeStream();
    }
  });

  await connectDB();

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received, shutting down...`);
    stopSimulator();
    await wss.close();
    server.close();
    await stopTeamChangeStream();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
