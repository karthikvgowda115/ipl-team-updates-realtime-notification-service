import { useCallback, useEffect, useState } from 'react';
import { toApiError } from '../api/auth';
import {
  TEAM_FIELDS,
  fetchTeams,
  followTeam,
  unfollowTeam,
  updateFollowFields,
  type Team,
  type TeamField,
  type TeamSnapshot,
} from '../api/teams';
import { useRealtimeEvent } from '../realtime/RealtimeContext';

const HIGHLIGHT_MS = 4000;

/**
 * Teams + the current user's subscriptions, shared by the Teams page and the Dashboard:
 * loading, optimistic follow/unfollow with rollback, saving notification fields, and live
 * team values from `team:update` WebSocket pushes (with the changed fields for highlighting).
 */
export function useTeams() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [changed, setChanged] = useState<Record<string, string[]>>({});

  const load = useCallback(() => {
    setError(null);
    fetchTeams()
      .then(setTeams)
      .catch((err) => setError(toApiError(err).message));
  }, []);
  useEffect(load, [load]);

  // Any team change (admin API, script, mongosh) arrives over the WebSocket.
  useRealtimeEvent('team:update', (msg) => {
    const { changed: fields, ...values } = msg.team as TeamSnapshot;
    setTeams((ts) => ts?.map((x) => (x.short === values.short ? { ...x, ...values } : x)) ?? ts);
    setChanged((c) => ({ ...c, [values.short]: fields }));
    window.setTimeout(() => setChanged((c) => ({ ...c, [values.short]: [] })), HIGHLIGHT_MS);
  });

  const setFollowing = (short: string, following: boolean) =>
    setTeams(
      (ts) =>
        ts?.map((t) =>
          t.short === short && t.following !== following
            ? {
                ...t,
                following,
                fields: following ? [...TEAM_FIELDS] : null, // a new follow notifies about everything
                followers: Math.max(0, t.followers + (following ? 1 : -1)),
              }
            : t,
        ) ?? ts,
    );

  const setFields = (short: string, fields: TeamField[]) =>
    setTeams((ts) => ts?.map((t) => (t.short === short ? { ...t, fields } : t)) ?? ts);

  /** Throws on failure so the FieldPicker can show the error inline. */
  const saveFields = async (team: Team, fields: TeamField[]) => {
    setFields(team.short, await updateFollowFields(team.short, fields));
  };

  const toggleFollow = async (team: Team) => {
    const next = !team.following;
    setActionError(null);
    setBusy((b) => new Set(b).add(team.short));
    setFollowing(team.short, next); // optimistic update
    try {
      if (next) {
        const { fields } = await followTeam(team.short);
        setFields(team.short, fields); // already-following case keeps the saved selection
      } else {
        await unfollowTeam(team.short);
      }
    } catch (err) {
      setFollowing(team.short, !next); // roll back
      setActionError(`Could not ${next ? 'follow' : 'unfollow'} ${team.short}: ${toApiError(err).message}`);
    } finally {
      setBusy((b) => {
        const copy = new Set(b);
        copy.delete(team.short);
        return copy;
      });
    }
  };

  return { teams, error, actionError, busy, changed, load, toggleFollow, saveFields };
}
