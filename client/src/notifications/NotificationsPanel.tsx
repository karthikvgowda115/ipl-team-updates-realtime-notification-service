import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError } from '../api/auth';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '../api/notifications';
import TeamBadge from '../teams/TeamBadge';
import { useRealtimeEvent, useRealtimeStatus } from '../realtime/RealtimeContext';
import { timeAgo } from './timeAgo';

// New notifications arrive over the WebSocket. Polling is only a fallback while the
// socket is down (e.g. a proxy that blocks WebSockets).
const FALLBACK_POLL_MS = 30000;
const CLOCK_TICK_MS = 30000;
const FRESH_MS = 4000;

type Filter = 'all' | 'unread';

export default function NotificationsPanel({ onUnreadChange }: { onUnreadChange?: (count: number) => void } = {}) {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // Lets the dashboard's stats tile show the same live unread count without another request.
  useEffect(() => onUnreadChange?.(unreadCount), [unreadCount, onUnreadChange]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [, setTick] = useState(0); // re-render so "x minutes ago" stays fresh
  const filterRef = useRef(filter);
  filterRef.current = filter;
  // True once the user has clicked "Load older": refreshes must then keep those older items.
  const loadedOlderRef = useRef(false);

  /** Fetches the newest page (initial load + polling). */
  const refresh = useCallback(async () => {
    try {
      const page = await fetchNotifications({ unread: filterRef.current === 'unread' });
      setError(null);
      setUnreadCount(page.unreadCount);
      // Ids are ObjectIds (24 hex chars, time-ordered), so string comparison = age comparison.
      const keepOlder = loadedOlderRef.current && page.nextCursor !== null;
      const oldestFresh = page.notifications[page.notifications.length - 1]?.id ?? '';
      setItems((prev) =>
        keepOlder && prev ? [...page.notifications, ...prev.filter((n) => n.id < oldestFresh)] : page.notifications,
      );
      setNextCursor((cur) => (keepOlder ? cur : page.nextCursor));
    } catch (err) {
      setError(toApiError(err).message);
    }
  }, []);

  // (Re)load when the filter changes.
  useEffect(() => {
    loadedOlderRef.current = false;
    setItems(null);
    setNextCursor(null);
    void refresh();
  }, [filter, refresh]);

  const wsStatus = useRealtimeStatus();
  const [fresh, setFresh] = useState<Set<string>>(new Set()); // just arrived → highlight briefly

  // Each time the socket (re)connects, re-fetch: anything created while we were
  // disconnected was never pushed to us, but it IS saved in MongoDB.
  useEffect(() => {
    if (wsStatus === 'open') void refresh();
  }, [wsStatus, refresh]);

  // Live push: a notification was just saved for this user.
  useRealtimeEvent('notification:new', (msg) => {
    const n = msg.notification as Notification;
    setUnreadCount(msg.unreadCount as number);
    setItems((prev) => (prev && !prev.some((p) => p.id === n.id) ? [n, ...prev] : prev));
    setFresh((s) => new Set(s).add(n.id));
    window.setTimeout(
      () =>
        setFresh((s) => {
          const copy = new Set(s);
          copy.delete(n.id);
          return copy;
        }),
      FRESH_MS,
    );
  });

  // Read in another tab/device → mirror it here.
  useRealtimeEvent('notification:read', (msg) => {
    const ids = msg.ids as string[] | 'all';
    setUnreadCount(msg.unreadCount as number);
    setItems(
      (prev) => prev?.map((x) => (ids === 'all' || ids.includes(x.id) ? { ...x, read: true } : x)) ?? prev,
    );
  });

  // Fallback polling only while the WebSocket is not connected.
  useEffect(() => {
    if (wsStatus === 'open') return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [wsStatus, refresh]);

  // Keep "x minutes ago" fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchNotifications({ before: nextCursor, unread: filter === 'unread' });
      loadedOlderRef.current = true;
      setItems((prev) => [...(prev ?? []), ...page.notifications.filter((n) => !prev?.some((p) => p.id === n.id))]);
      setNextCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const markOne = async (n: Notification) => {
    if (n.read) return;
    // Optimistic: mark read locally, roll back on failure.
    setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? prev);
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const res = await markNotificationRead(n.id);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: false } : x)) ?? prev);
      setUnreadCount((c) => c + 1);
      setError(toApiError(err).message);
    }
  };

  const markAll = async () => {
    const before = items;
    const beforeCount = unreadCount;
    setItems((prev) => prev?.map((x) => ({ ...x, read: true })) ?? prev);
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      setItems(before);
      setUnreadCount(beforeCount);
      setError(toApiError(err).message);
    }
  };

  const shown = filter === 'unread' ? items?.filter((n) => !n.read) : items;

  return (
    <section className="card notifications">
      <div className="page-head">
        <h2>
          Notifications{' '}
          <span
            className={`live-dot ${wsStatus === 'open' ? 'on' : 'off'}`}
            title={wsStatus === 'open' ? 'Live: new notifications appear instantly' : 'Reconnecting… (checking every 30s)'}
          />
          {unreadCount > 0 && (
            <span className="count-badge" aria-label={`${unreadCount} unread`}>
              {unreadCount}
            </span>
          )}
        </h2>
        <div className="head-actions">
          <div className="segmented" role="group" aria-label="Filter notifications">
            <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              All
            </button>
            <button type="button" className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>
              Unread
            </button>
          </div>
          <button type="button" className="secondary" onClick={markAll} disabled={unreadCount === 0}>
            Mark all read
          </button>
        </div>
      </div>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {!items && !error && <p className="muted">Loading…</p>}
      {shown && shown.length === 0 && (
        <p className="muted empty">
          {filter === 'unread'
            ? "You're all caught up."
            : 'No notifications yet. When a team you follow changes, you’ll see it here.'}
        </p>
      )}

      {shown && shown.length > 0 && (
        <ul className="notif-list">
          {shown.map((n) => (
            <li key={n.id} className={`notif ${n.read ? 'read' : 'unread'}${fresh.has(n.id) ? ' fresh' : ''}`}>
              <TeamBadge short={n.teamShort} size={40} />
              <div className="notif-body">
                <div className="notif-title">
                  <strong>{n.title}</strong>
                  <time className="muted small" dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>
                    {timeAgo(n.createdAt)}
                  </time>
                </div>
                <ul className="notif-changes">
                  {n.changes.map((c) => (
                    <li key={c.field}>
                      <span className="change-label">{c.label}</span>{' '}
                      {c.from !== undefined && c.from !== null && (
                        <>
                          <span className="change-from">{String(c.from)}</span>{' '}
                        </>
                      )}
                      → <strong>{c.to === null ? '(removed)' : String(c.to)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              {!n.read && (
                <button
                  type="button"
                  className="mark-read"
                  onClick={() => markOne(n)}
                  aria-label={`Mark "${n.title}" as read`}
                  title="Mark as read"
                >
                  ✓
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <button type="button" className="secondary full-width" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load older notifications'}
        </button>
      )}
    </section>
  );
}
