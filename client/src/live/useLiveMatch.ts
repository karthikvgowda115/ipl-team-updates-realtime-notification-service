import { useEffect, useState } from 'react';
import { toApiError } from '../api/auth';
import { fetchCurrentScore, type ScorePayload } from '../api/matches';
import { useChannel, useRealtimeEvent } from '../realtime/RealtimeContext';

/** Newer state wins: a slow REST response must not overwrite a fresher WebSocket update. */
function isNewer(next: ScorePayload, cur: ScorePayload): boolean {
  if (!next.match || !cur.match || next.match.id !== cur.match.id) return true;
  return next.match.ballsBowled > cur.match.ballsBowled || next.match.status !== cur.match.status;
}

/**
 * Current match, kept live: initial GET /api/matches/current, then every ball from the
 * WebSocket "score" channel (joined while the component is mounted).
 * `score` is undefined while loading; its fields are null when no match has been played.
 */
export function useLiveMatch() {
  const [score, setScore] = useState<ScorePayload | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useChannel('score');
  useRealtimeEvent('score:update', (msg) => {
    const next: ScorePayload = { live: msg.live ?? null, match: msg.match ?? null };
    setScore((cur) => (cur === undefined || isNewer(next, cur) ? next : cur));
  });

  useEffect(() => {
    fetchCurrentScore()
      .then((next) => setScore((cur) => (cur === undefined || isNewer(next, cur) ? next : cur)))
      .catch((err) => setError(toApiError(err).message));
  }, []);

  return { score, error };
}
