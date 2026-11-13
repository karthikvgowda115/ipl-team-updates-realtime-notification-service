/**
 * WebSocket message protocol. Every frame is one JSON object with a `type`.
 *
 * Client → server
 *   { type: 'auth', token }                 must be the FIRST message (within AUTH_TIMEOUT_MS)
 *   { type: 'subscribe', channel: 'score' } start receiving live score updates
 *   { type: 'unsubscribe', channel: 'score' }
 *
 * Server → client
 *   { type: 'auth:ok', user: { id, name, role } }
 *   { type: 'notification:new', notification, unreadCount }
 *   { type: 'notification:read', ids: string[] | 'all', unreadCount }
 *   { type: 'score:update', live, match }    live = compact score summary, match = full state
 *   { type: 'team:update', team }            a team's new values (any change, for live cards)
 *   { type: 'error', message }
 *
 * Close codes (4000–4999 are free for applications):
 *   4001 auth failed / not sent in time → client must NOT reconnect with the same token
 *   4002 token expired                   → client should log out
 *   4400 malformed message
 *   1001 server shutting down            → client reconnects with backoff
 */

export const WS_PATH = '/api/ws';
/**
 * Public, read-only live-score socket: no auth, no messages needed — it immediately
 * receives the current score and then every ball as { type: 'score:update', ... }.
 * (Match scores aren't private; notifications stay on the authenticated WS_PATH.)
 */
export const WS_LIVE_PATH = '/api/ws/live';
export const AUTH_TIMEOUT_MS = 10_000;
export const HEARTBEAT_MS = 30_000;
export const MAX_MESSAGE_BYTES = 4 * 1024;

export const CHANNELS = ['score'] as const;
export type Channel = (typeof CHANNELS)[number];

export const CLOSE = {
  AUTH_FAILED: 4001,
  TOKEN_EXPIRED: 4002,
  BAD_MESSAGE: 4400,
  GOING_AWAY: 1001,
} as const;

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; channel: Channel }
  | { type: 'unsubscribe'; channel: Channel };

export type ServerMessage =
  | { type: 'auth:ok'; user: { id: string; name: string; role: string } }
  | { type: 'notification:new'; notification: unknown; unreadCount: number }
  | { type: 'notification:read'; ids: string[] | 'all'; unreadCount: number }
  | { type: 'score:update'; live: unknown; match: unknown }
  | { type: 'team:update'; team: unknown }
  | { type: 'error'; message: string };

/** Validates an incoming frame; returns null if it isn't a well-formed client message. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;
  if (m.type === 'auth' && typeof m.token === 'string' && m.token.length < 2048) {
    return { type: 'auth', token: m.token };
  }
  if ((m.type === 'subscribe' || m.type === 'unsubscribe') && CHANNELS.includes(m.channel as Channel)) {
    return { type: m.type, channel: m.channel as Channel };
  }
  return null;
}
