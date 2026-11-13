import mongoose, { Types } from 'mongoose';
import type { ChangeStream, ChangeStreamDocument, Document, ResumeToken } from 'mongodb';
import { Team } from '../models/Team';
import { createTeamChangeNotifications, formatChangeMessage } from '../services/notification.service';
import { teamEvents } from '../services/team.events';
import { diffTeamChange } from './diffTeamChange';

/**
 * Watches the `teams` collection with a MongoDB Change Stream. Every update — from the
 * API, an admin, a script or mongosh — becomes ONE grouped notification per follower.
 *
 * Reliability:
 * - The resume token is saved after each processed event, so changes made while the
 *   server was down are picked up on the next start (within Atlas' oplog window).
 * - Notifications carry the event id with a unique index, so replays never duplicate.
 * - On errors the stream is closed and restarted with backoff.
 */

const STATE_COLLECTION = 'change_stream_state';
const STATE_ID = 'teams';
const RESTART_DELAY_MS = 5000;

let stream: ChangeStream<Document, ChangeStreamDocument<Document>> | null = null;
let running = false;
let stopped = false;
let restartTimer: NodeJS.Timeout | null = null;

function stateCollection() {
  return mongoose.connection.collection<{ _id: string; token: ResumeToken; updatedAt: Date }>(STATE_COLLECTION);
}

async function loadResumeToken(): Promise<ResumeToken | undefined> {
  const doc = await stateCollection().findOne({ _id: STATE_ID });
  return doc?.token;
}

async function saveResumeToken(token: ResumeToken): Promise<void> {
  await stateCollection().updateOne(
    { _id: STATE_ID },
    { $set: { token, updatedAt: new Date() } },
    { upsert: true },
  );
}

async function clearResumeToken(): Promise<void> {
  await stateCollection().deleteOne({ _id: STATE_ID });
}

/**
 * Asks MongoDB to store pre-images for `teams`, so notifications can show old → new values.
 * Needs MongoDB 6.0+ and collMod permission; if not allowed we just go without old values.
 */
async function enablePreImages(): Promise<boolean> {
  try {
    await mongoose.connection.db!.command({
      collMod: Team.collection.collectionName,
      changeStreamPreAndPostImages: { enabled: true },
    });
    return true;
  } catch (err) {
    console.warn(`[change-stream] Pre-images unavailable (${(err as Error).message}); notifications will show new values only.`);
    return false;
  }
}

async function handleEvent(event: ChangeStreamDocument<Document>): Promise<void> {
  if (event.operationType !== 'update' && event.operationType !== 'replace') return;

  const changes = diffTeamChange(event);
  if (changes.length === 0) return; // e.g. only updatedAt changed, or values set to the same thing

  const doc = event.fullDocument ?? event.fullDocumentBeforeChange;
  if (!doc) {
    console.warn('[change-stream] Team changed but document is gone (deleted?); skipping');
    return;
  }

  const created = await createTeamChangeNotifications({
    eventId: (event._id as { _data: string })._data,
    teamId: event.documentKey._id as Types.ObjectId,
    teamShort: String(doc.short),
    teamName: String(doc.name),
    changes,
  });

  console.log(
    `[change-stream] ${formatChangeMessage(String(doc.short), changes).replace(/\n/g, ' | ')} → ${created.length} notification(s)`,
  );

  // Everyone with the app open sees the new team values (cards, dashboard) without reloading.
  if (event.fullDocument) {
    const d = event.fullDocument;
    teamEvents.emitUpdated({
      id: String(d._id),
      name: String(d.name),
      short: String(d.short),
      captain: String(d.captain),
      headCoach: String(d.headCoach),
      homeGround: String(d.homeGround),
      titles: Number(d.titles),
      wins: Number(d.wins),
      losses: Number(d.losses),
      points: Number(d.points),
      changed: changes.map((c) => c.field),
    });
  }
}

function isHistoryLost(err: unknown): boolean {
  const e = err as { code?: number; codeName?: string };
  // ChangeStreamHistoryLost (286) / InvalidResumeToken (260): the saved token is too old.
  return e.code === 286 || e.code === 260 || e.codeName === 'ChangeStreamHistoryLost';
}

async function run(): Promise<void> {
  const resumeAfter = await loadResumeToken();
  const s = Team.collection.watch<Document, ChangeStreamDocument<Document>>(
    [{ $match: { operationType: { $in: ['update', 'replace'] } } }],
    {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
      ...(resumeAfter ? { resumeAfter } : {}),
    },
  );
  stream = s;
  console.log(`[change-stream] Watching "teams" for changes${resumeAfter ? ' (resuming from last saved position)' : ''}`);

  // Process strictly one event at a time, in order; save the token only after success.
  while (!stopped && (await s.hasNext())) {
    const event = await s.next();
    try {
      await handleEvent(event);
    } catch (err) {
      // Don't let one bad event block the stream forever: log it and move on.
      console.error('[change-stream] Failed to process event:', (err as Error).message);
    }
    await saveResumeToken(event._id);
  }
}

function scheduleRestart(): void {
  if (stopped || restartTimer) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void startTeamChangeStream();
  }, RESTART_DELAY_MS);
}

/** Starts the watcher (no-op if already running). Safe to call on every (re)connect. */
export async function startTeamChangeStream(): Promise<void> {
  if (running) return;
  running = true;
  stopped = false;
  try {
    await run();
  } catch (err) {
    if (stopped) return;
    if (isHistoryLost(err)) {
      console.warn('[change-stream] Saved position is too old for the oplog; starting from now.');
      await clearResumeToken().catch(() => undefined);
    } else {
      console.error(`[change-stream] Stream error: ${(err as Error).message}. Restarting in ${RESTART_DELAY_MS / 1000}s...`);
    }
    scheduleRestart();
  } finally {
    running = false;
    await stream?.close().catch(() => undefined);
    stream = null;
  }
}

/** Called once after connecting: enable pre-images, then start watching. */
export async function initTeamChangeStream(): Promise<void> {
  await enablePreImages();
  void startTeamChangeStream();
}

/**
 * True once the watcher's initial aggregate has run (MongoDB returned a resume token),
 * i.e. every change from now on will be seen. Used by /health and the integration tests.
 */
export function isTeamChangeStreamReady(): boolean {
  return running && !!stream?.resumeToken;
}

export async function stopTeamChangeStream(): Promise<void> {
  stopped = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  await stream?.close().catch(() => undefined);
}
