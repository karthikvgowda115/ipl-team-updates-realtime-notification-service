import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Notification } from '../src/models/Notification';
import { Team } from '../src/models/Team';
import { getWsStats } from '../src/websocket/wsServer';
import { auth, connect, signup, sleep, startTestServer, waitFor, WsClient, type TestServer, type TestUser } from './helpers';

let s: TestServer;
let alice: TestUser;
let bob: TestUser;
beforeAll(async () => {
  s = await startTestServer({ dbName: 'websocket' });
  [alice, bob] = await Promise.all([signup(s), signup(s)]);
  await s.api().post('/api/subscriptions').set(auth(alice)).send({ teamId: 'RCB' });
  await s.api().post('/api/subscriptions').set(auth(bob)).send({ teamId: 'MI' });
});
afterAll(() => s.close());

describe('WebSocket authentication', () => {
  it('accepts a valid JWT and says who you are', async () => {
    const c = await connect(s, alice);
    expect(c.of('auth:ok')[0].user).toMatchObject({ id: alice.id, role: 'user' });
    c.close();
  });

  it('closes with 4001 for an invalid token, a forged token, or any message before auth', async () => {
    for (const token of ['garbage', jwt.sign({ sub: alice.id, role: 'admin' }, 'wrong-secret')]) {
      const c = new WsClient(`${s.wsUrl}/api/ws`);
      await c.opened();
      c.send({ type: 'auth', token });
      await waitFor(() => c.closeCode !== null, 3000, 'close');
      expect(c.closeCode).toBe(4001);
    }
    const early = new WsClient(`${s.wsUrl}/api/ws`);
    await early.opened();
    early.send({ type: 'subscribe', channel: 'score' });
    await waitFor(() => early.closeCode !== null, 3000, 'close');
    expect(early.closeCode).toBe(4001);
  });

  it('closes with 4400 for malformed messages and rejects unknown paths', async () => {
    const c = new WsClient(`${s.wsUrl}/api/ws`);
    await c.opened();
    c.send('{not json');
    await waitFor(() => c.closeCode !== null, 3000, 'close');
    expect(c.closeCode).toBe(4400);

    const status = await new Promise<number>((resolve) => {
      const w = new WebSocket(`${s.wsUrl}/api/nope`);
      w.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      w.on('error', () => resolve(-1));
    });
    expect(status).toBe(404);
  });

  it('closes with 4002 when the JWT expires', async () => {
    const short = jwt.sign({ sub: alice.id, role: 'user' }, process.env.JWT_SECRET!, { expiresIn: 1 });
    const c = new WsClient(`${s.wsUrl}/api/ws`);
    await c.authenticate(short);
    await waitFor(() => c.closeCode !== null, 4000, 'expiry close');
    expect(c.closeCode).toBe(4002);
  });
});

describe('real-time notification delivery', () => {
  it('pushes ONE grouped notification instantly to every tab of the right user only', async () => {
    const tab1 = await connect(s, alice);
    const tab2 = await connect(s, alice);
    const bobSock = await connect(s, bob);

    await Team.collection.updateOne({ short: 'RCB' }, { $set: { captain: 'WS Captain', wins: 41, points: 82 } });
    await waitFor(() => tab1.of('notification:new').length === 1 && tab2.of('notification:new').length === 1, 8000, 'push');
    const msg = tab1.of('notification:new')[0];
    expect(msg.notification.changes.map((c: { field: string }) => c.field)).toEqual(['captain', 'wins', 'points']);
    expect(msg.unreadCount).toBe(1);

    await sleep(500);
    expect(bobSock.of('notification:new')).toHaveLength(0); // never another user's notification
    expect(tab1.of('team:update').at(-1)?.team).toMatchObject({ short: 'RCB', captain: 'WS Captain' }); // live card data
    expect(bobSock.of('team:update')).toHaveLength(1); // team values are public to logged-in users
    [tab1, tab2, bobSock].forEach((c) => c.close());
  });

  it('marking read syncs the other tabs of the same user', async () => {
    const tab1 = await connect(s, alice);
    const tab2 = await connect(s, alice);
    await s.api().patch('/api/notifications/read-all').set(auth(alice));
    await waitFor(() => tab2.of('notification:read').length === 1, 5000, 'read sync');
    expect(tab2.of('notification:read')[0]).toMatchObject({ ids: 'all', unreadCount: 0 });
    tab1.close();
    tab2.close();
  });

  it('a disconnected user causes no errors, keeps the notification, and gets later ones after reconnecting', async () => {
    const c = await connect(s, alice);
    c.close();
    await waitFor(() => getWsStats().connections === 0, 3000, 'cleanup');
    expect(getWsStats().users).toBe(0); // registry cleaned up

    const before = await Notification.countDocuments({ user: alice.id });
    await Team.collection.updateOne({ short: 'RCB' }, { $set: { headCoach: 'Offline Coach' } });
    await waitFor(async () => (await Notification.countDocuments({ user: alice.id })) === before + 1, 8000, 'saved while offline');

    const again = await connect(s, alice); // reconnect
    await Team.collection.updateOne({ short: 'RCB' }, { $set: { headCoach: 'Back Online Coach' } });
    await waitFor(() => again.of('notification:new').length === 1, 8000, 'push after reconnect');
    expect(again.of('notification:new')[0].notification.changes[0]).toMatchObject({ field: 'headCoach', to: 'Back Online Coach' });
    again.close();
  });
});
