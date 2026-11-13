import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { verifyToken } from '../services/token.service';
import {
  AUTH_TIMEOUT_MS,
  CLOSE,
  HEARTBEAT_MS,
  MAX_MESSAGE_BYTES,
  WS_LIVE_PATH,
  WS_PATH,
  parseClientMessage,
  type Channel,
  type ServerMessage,
} from './protocol';

/** One open browser connection (a user with 3 tabs open has 3 of these). */
interface Client {
  ws: WebSocket;
  userId: string | null; // null until the auth message is accepted
  alive: boolean; // heartbeat flag: set false on ping, true on pong
  channels: Set<Channel>;
  timers: NodeJS.Timeout[];
}

const allClients = new Map<WebSocket, Client>(); // every open socket, authenticated or not
const clientsByUser = new Map<string, Set<Client>>();
const channelMembers = new Map<Channel, Set<Client>>();
type SubscribeHook = (channel: Channel, send: (msg: ServerMessage) => void) => void;
let onSubscribeHook: SubscribeHook | null = null;

// ---------------- sending ----------------

function sendRaw(client: Client, data: string): void {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.send(data);
}

function send(client: Client, msg: ServerMessage): void {
  sendRaw(client, JSON.stringify(msg));
}

/** Pushes a message to every open connection of one user. Returns how many got it. */
export function sendToUser(userId: string, msg: ServerMessage): number {
  const set = clientsByUser.get(userId);
  if (!set?.size) return 0;
  const data = JSON.stringify(msg); // serialize once, send many
  for (const c of set) sendRaw(c, data);
  return set.size;
}

export function isUserConnected(userId: string): boolean {
  return (clientsByUser.get(userId)?.size ?? 0) > 0;
}

/** Pushes a message to every connection subscribed to a channel. */
export function broadcast(channel: Channel, msg: ServerMessage): number {
  const set = channelMembers.get(channel);
  if (!set?.size) return 0;
  const data = JSON.stringify(msg);
  for (const c of set) sendRaw(c, data);
  return set.size;
}

/** Pushes a message to every authenticated connection (e.g. live team values). */
export function broadcastAuthenticated(msg: ServerMessage): number {
  const data = JSON.stringify(msg);
  let n = 0;
  for (const set of clientsByUser.values()) {
    for (const c of set) {
      sendRaw(c, data);
      n += 1;
    }
  }
  return n;
}

/** Lets other modules send an initial snapshot when someone subscribes (e.g. current score). */
export function onChannelSubscribe(hook: SubscribeHook): void {
  onSubscribeHook = hook;
}

export function getWsStats() {
  let connections = 0;
  for (const s of clientsByUser.values()) connections += s.size;
  return { users: clientsByUser.size, connections, scoreSubscribers: channelMembers.get('score')?.size ?? 0 };
}

// ---------------- connection lifecycle ----------------

function cleanup(client: Client): void {
  allClients.delete(client.ws);
  client.timers.forEach(clearTimeout);
  if (client.userId) {
    const set = clientsByUser.get(client.userId);
    set?.delete(client);
    if (set && set.size === 0) clientsByUser.delete(client.userId);
  }
  for (const ch of client.channels) channelMembers.get(ch)?.delete(client);
  client.channels.clear();
}

async function authenticate(client: Client, token: string): Promise<void> {
  const payload = verifyToken(token);
  if (!payload || !mongoose.isValidObjectId(payload.sub)) {
    client.ws.close(CLOSE.AUTH_FAILED, 'Invalid or expired token');
    return;
  }
  if (mongoose.connection.readyState !== 1) {
    // Temporary problem: a normal close lets the client retry with backoff.
    client.ws.close(1011, 'Database unavailable');
    return;
  }
  const user = await User.findById(payload.sub).select('name role');
  if (!user) {
    client.ws.close(CLOSE.AUTH_FAILED, 'Account no longer exists');
    return;
  }
  if (client.ws.readyState !== WebSocket.OPEN) return; // closed while we were checking

  client.userId = user.id;
  client.timers.forEach(clearTimeout); // auth timeout no longer applies
  client.timers = [];
  if (!clientsByUser.has(user.id)) clientsByUser.set(user.id, new Set());
  clientsByUser.get(user.id)!.add(client);

  // Close the socket when the JWT expires, just like REST calls start returning 401.
  if (payload.exp) {
    const ms = Math.min(payload.exp * 1000 - Date.now(), 2_147_483_647);
    client.timers.push(setTimeout(() => client.ws.close(CLOSE.TOKEN_EXPIRED, 'Token expired'), Math.max(ms, 0)));
  }

  send(client, { type: 'auth:ok', user: { id: user.id, name: user.name, role: user.role } });
}

function onMessage(client: Client, data: RawData): void {
  const msg = parseClientMessage(data.toString());
  if (!msg) {
    client.ws.close(CLOSE.BAD_MESSAGE, 'Malformed message');
    return;
  }

  if (!client.userId) {
    // Before authentication the ONLY thing a client may do is authenticate.
    if (msg.type !== 'auth') {
      client.ws.close(CLOSE.AUTH_FAILED, 'Authenticate first');
      return;
    }
    authenticate(client, msg.token).catch((err: Error) => {
      console.error('[ws] auth error:', err.message);
      client.ws.close(1011, 'Server error');
    });
    return;
  }

  switch (msg.type) {
    case 'auth':
      send(client, { type: 'error', message: 'Already authenticated' });
      return;
    case 'subscribe':
      joinChannel(client, msg.channel);
      return;
    case 'unsubscribe':
      channelMembers.get(msg.channel)?.delete(client);
      client.channels.delete(msg.channel);
      return;
  }
}

function joinChannel(client: Client, channel: Channel): void {
  if (!channelMembers.has(channel)) channelMembers.set(channel, new Set());
  channelMembers.get(channel)!.add(client);
  client.channels.add(channel);
  onSubscribeHook?.(channel, (m) => send(client, m)); // initial snapshot
}

/** Public live-score viewer: joins "score" right away; nothing it sends is accepted. */
function onLiveConnection(ws: WebSocket): void {
  const client: Client = { ws, userId: null, alive: true, channels: new Set(), timers: [] };
  allClients.set(ws, client);
  ws.on('pong', () => (client.alive = true));
  ws.on('message', () => send(client, { type: 'error', message: 'This socket is read-only' }));
  ws.on('close', () => cleanup(client));
  ws.on('error', () => cleanup(client));
  joinChannel(client, 'score');
}

function onConnection(ws: WebSocket): void {
  const client: Client = { ws, userId: null, alive: true, channels: new Set(), timers: [] };
  allClients.set(ws, client);

  // The client has AUTH_TIMEOUT_MS to send { type: 'auth', token }.
  client.timers.push(
    setTimeout(() => {
      if (!client.userId) ws.close(CLOSE.AUTH_FAILED, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS),
  );

  ws.on('pong', () => (client.alive = true));
  ws.on('message', (data) => onMessage(client, data));
  ws.on('close', () => cleanup(client));
  ws.on('error', (err) => {
    console.warn('[ws] socket error:', err.message);
    cleanup(client);
  });
}

// ---------------- server setup ----------------

/**
 * Attaches the WebSocket server to the existing HTTP server (same port as the REST API).
 * Only upgrade requests for WS_PATH are accepted.
 */
export function attachWebSocketServer(server: Server): { close: () => Promise<void> } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const handler = pathname === WS_PATH ? onConnection : pathname === WS_LIVE_PATH ? onLiveConnection : null;
    if (!handler) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => handler(ws));
  });

  // Heartbeat: ping everyone; anyone who didn't answer the previous ping is dead
  // (laptop closed, network dropped) and gets terminated so we don't leak sockets.
  // Regular pings also keep proxies (nginx, load balancers) from closing idle connections.
  const heartbeat = setInterval(() => {
    for (const client of allClients.values()) {
      if (!client.alive) {
        client.ws.terminate(); // fires 'close' → cleanup()
        continue;
      }
      client.alive = false;
      client.ws.ping();
    }
  }, HEARTBEAT_MS);

  console.log(`[ws] WebSocket server ready at ${WS_PATH} (auth) and ${WS_LIVE_PATH} (public live score)`);

  return {
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.close(CLOSE.GOING_AWAY, 'Server shutting down');
        wss.close(() => resolve());
      }),
  };
}
