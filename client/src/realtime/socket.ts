/**
 * Browser side of the real-time connection (see server/src/websocket/protocol.ts).
 *
 *  1. open  ws(s)://<host>/api/ws        (same origin; Vite/nginx forward it to Express)
 *  2. send  { type: 'auth', token }      (JWT as the first message — never in the URL,
 *                                         so it doesn't end up in proxy/access logs)
 *  3. recv  { type: 'auth:ok' }          → status 'open'; re-join channels (e.g. "score")
 *  4. recv  pushes: notification:new / notification:read / score:update
 *  5. on drop: reconnect with exponential backoff + jitter (1s, 2s, 4s … max 30s),
 *     except for auth failures (4001/4002) where retrying the same token is pointless.
 */

import { API_ORIGIN } from '../api/client';

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';
export type Channel = 'score';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServerMessage = { type: string; [key: string]: any };
type Handler = (msg: ServerMessage) => void;

const AUTH_FAILED = 4001;
const TOKEN_EXPIRED = 4002;
const MAX_BACKOFF_MS = 30_000;

function socketUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;
  // Deployed backend: https://host → wss://host/api/ws (http → ws for local testing).
  if (API_ORIGIN) return `${API_ORIGIN.replace(/^http/, 'ws')}/api/ws`;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/ws`;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private status: ConnStatus = 'idle';
  private attempt = 0;
  private retryTimer: number | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private statusListeners = new Set<(s: ConnStatus) => void>();
  private channelRefs = new Map<Channel, number>(); // how many components want each channel

  /** Called when the server rejects the token (4001) or it expires (4002). */
  onAuthFailure: ((code: number) => void) | null = null;

  constructor() {
    // Back online → don't wait for the backoff timer.
    window.addEventListener('online', () => {
      if (this.token && this.status === 'reconnecting') this.reconnectNow();
    });
  }

  getStatus(): ConnStatus {
    return this.status;
  }

  connect(token: string): void {
    if (this.token === token && this.ws) return;
    this.disconnect();
    this.token = token;
    this.attempt = 0;
    this.open();
  }

  disconnect(): void {
    this.token = null;
    this.clearRetry();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'Client disconnect');
    this.setStatus('idle');
  }

  /** Listen for one message type. Returns an unsubscribe function. */
  on(type: string, handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  onStatus(listener: (s: ConnStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Join a channel (reference-counted). Returns a function that leaves it. */
  join(channel: Channel): () => void {
    const n = this.channelRefs.get(channel) ?? 0;
    this.channelRefs.set(channel, n + 1);
    if (n === 0 && this.status === 'open') this.send({ type: 'subscribe', channel });
    let left = false;
    return () => {
      if (left) return;
      left = true;
      const m = (this.channelRefs.get(channel) ?? 1) - 1;
      if (m > 0) {
        this.channelRefs.set(channel, m);
        return;
      }
      this.channelRefs.delete(channel);
      if (this.status === 'open') this.send({ type: 'unsubscribe', channel });
    };
  }

  // ---------------- internals ----------------

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private setStatus(s: ConnStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  private dispatch(msg: ServerMessage): void {
    this.handlers.get(msg.type)?.forEach((h) => h(msg));
  }

  private open(): void {
    if (!this.token) return;
    const ws = new WebSocket(socketUrl());
    this.ws = ws;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: this.token }));

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.type === 'auth:ok') {
        this.attempt = 0;
        this.setStatus('open');
        // Channels are per-connection on the server, so re-join after every (re)connect.
        for (const channel of this.channelRefs.keys()) this.send({ type: 'subscribe', channel });
      }
      this.dispatch(msg);
    };

    ws.onclose = (event) => {
      if (this.ws !== ws) return; // an old socket we already replaced
      this.ws = null;
      if (!this.token) return this.setStatus('idle');
      if (event.code === AUTH_FAILED || event.code === TOKEN_EXPIRED) {
        this.setStatus('idle');
        this.onAuthFailure?.(event.code);
        return;
      }
      this.scheduleReconnect();
    };
    // onerror is always followed by onclose, which handles reconnecting.
  }

  private scheduleReconnect(): void {
    this.clearRetry();
    this.setStatus('reconnecting');
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    const delay = base / 2 + Math.random() * (base / 2); // jitter: avoid every tab reconnecting at once
    this.attempt += 1;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private reconnectNow(): void {
    this.clearRetry();
    this.open();
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
