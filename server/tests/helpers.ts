import http from 'http';
import type { AddressInfo } from 'net';
import mongoose from 'mongoose';
import request from 'supertest';
import WebSocket from 'ws';
import app from '../src/app';
import { initTeamChangeStream, isTeamChangeStreamReady, stopTeamChangeStream } from '../src/change-stream/teamChangeStream';
import { User } from '../src/models/User';
import { seedTeams } from '../src/seed/seedTeams';
import { stopSimulator } from '../src/simulator/matchSimulator';
import { initWebSocket } from '../src/websocket';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(pred: () => boolean | Promise<boolean>, timeoutMs = 8000, label = 'condition'): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await pred()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export interface TestServer {
  url: string; // http://127.0.0.1:port
  wsUrl: string; // ws://127.0.0.1:port
  api: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/**
 * Real app (Express + WebSocket + Change Stream) on a random port, against a fresh
 * database in the in-memory replica set. One per test file.
 */
export async function startTestServer({ dbName, changeStream = true }: { dbName: string; changeStream?: boolean }): Promise<TestServer> {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName });
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await seedTeams();

  const server = http.createServer(app);
  const wss = initWebSocket(server);
  if (changeStream) {
    await initTeamChangeStream();
    await waitFor(isTeamChangeStreamReady, 15000, 'change stream');
  }
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    api: () => request(server),
    close: async () => {
      stopSimulator();
      await wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await stopTeamChangeStream();
      await mongoose.disconnect();
    },
  };
}

let counter = 0;
export interface TestUser {
  id: string;
  token: string;
  username: string;
  email: string;
  password: string;
}

/** Signs up a user through the real API. */
export async function signup(s: TestServer, overrides: Partial<{ name: string; username: string; email: string; password: string }> = {}): Promise<TestUser> {
  counter += 1;
  const body = {
    name: `Fan ${counter}`,
    username: `fan_${counter}_${Date.now() % 100000}`,
    email: `fan${counter}.${Date.now()}@example.test`,
    password: 'Passw0rd!test',
    ...overrides,
  };
  const res = await s.api().post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.user.id, token: res.body.token, username: body.username, email: body.email, password: body.password };
}

/** Signs up a user, makes them admin in the DB and logs in again (token carries the role). */
export async function signupAdmin(s: TestServer): Promise<TestUser> {
  const u = await signup(s);
  await User.updateOne({ _id: u.id }, { $set: { role: 'admin' } });
  const res = await s.api().post('/api/auth/login').send({ email: u.email, password: u.password });
  return { ...u, token: res.body.token };
}

export const auth = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });

/** A WebSocket test client that records every message. */
export class WsClient {
  ws: WebSocket;
  messages: Array<Record<string, any>> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  closeCode: number | null = null;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (d) => this.messages.push(JSON.parse(d.toString())));
    this.ws.on('close', (code) => (this.closeCode = code));
    this.ws.on('error', () => undefined);
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(msg: unknown): void {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  of(type: string) {
    return this.messages.filter((m) => m.type === type);
  }

  async authenticate(token: string): Promise<void> {
    await this.opened();
    this.send({ type: 'auth', token });
    await waitFor(() => this.of('auth:ok').length > 0 || this.closeCode !== null, 5000, 'auth:ok');
    if (this.closeCode !== null) throw new Error(`socket closed during auth: ${this.closeCode}`);
  }

  close(): void {
    this.ws.terminate();
  }
}

/** Opens and authenticates a notification socket for a user. */
export async function connect(s: TestServer, u: TestUser): Promise<WsClient> {
  const c = new WsClient(`${s.wsUrl}/api/ws`);
  await c.authenticate(u.token);
  return c;
}
