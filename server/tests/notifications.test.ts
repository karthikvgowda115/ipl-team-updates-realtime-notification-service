import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Notification } from '../src/models/Notification';
import { Team } from '../src/models/Team';
import { createTeamChangeNotifications } from '../src/services/notification.service';
import { auth, signup, signupAdmin, sleep, startTestServer, waitFor, type TestServer, type TestUser } from './helpers';

const run = promisify(execFile);
const DB = 'notifications';

let s: TestServer;
let admin: TestUser;
let all: TestUser; // follows RCB, every field
let capPts: TestUser; // follows RCB, captain + points
let winsOnly: TestUser; // follows RCB, wins only
let other: TestUser; // follows CSK only

const countFor = (u: TestUser) => Notification.countDocuments({ user: u.id });
const latestFor = (u: TestUser) => Notification.findOne({ user: u.id }).sort({ _id: -1 }).lean();
const fieldsOf = (n: { changes: { field: string }[] } | null) => n?.changes.map((c) => c.field);

beforeAll(async () => {
  s = await startTestServer({ dbName: DB });
  admin = await signupAdmin(s);
  [all, capPts, winsOnly, other] = await Promise.all([signup(s), signup(s), signup(s), signup(s)]);
  await s.api().post('/api/subscriptions').set(auth(all)).send({ teamId: 'RCB' });
  await s.api().post('/api/subscriptions').set(auth(capPts)).send({ teamId: 'RCB', fields: ['captain', 'points'] });
  await s.api().post('/api/subscriptions').set(auth(winsOnly)).send({ teamId: 'RCB', fields: ['wins'] });
  await s.api().post('/api/subscriptions').set(auth(other)).send({ teamId: 'CSK' });
});
afterAll(() => s.close());
beforeEach(async () => {
  await Notification.deleteMany({});
});

describe('Change Stream → notifications', () => {
  it('admin API update of captain + points + wins → ONE grouped notification per follower, filtered by fields', async () => {
    const rcb = (await Team.findOne({ short: 'RCB' }).lean())!;
    const res = await s.api().patch('/api/admin/teams/RCB').set(auth(admin)).send({
      captain: 'API Captain', points: rcb.points + 2, wins: rcb.wins + 1,
    });
    expect(res.status).toBe(200);

    await waitFor(async () => (await Notification.countDocuments()) >= 3, 8000, '3 notifications');
    await sleep(300); // make sure nothing extra arrives

    expect(await countFor(all)).toBe(1); // ONE notification, not three
    const n = (await latestFor(all))!;
    expect(fieldsOf(n)).toEqual(['captain', 'wins', 'points']);
    expect(n).toMatchObject({ type: 'team_update', title: 'RCB updated', read: false, teamShort: 'RCB' });
    expect(n.message).toBe(`RCB updated\nCaptain → API Captain\nWins → ${rcb.wins + 1}\nPoints → ${rcb.points + 2}`);

    expect(await countFor(capPts)).toBe(1);
    expect(fieldsOf(await latestFor(capPts))).toEqual(['captain', 'points']); // wins filtered out
    expect(await countFor(winsOnly)).toBe(1);
    expect(fieldsOf(await latestFor(winsOnly))).toEqual(['wins']);
    expect(await countFor(other)).toBe(0); // follows CSK only
    expect(await countFor(admin)).toBe(0); // admin follows nothing
  });

  it('direct MongoDB update (mongosh-style, no app code involved) also notifies', async () => {
    await Team.collection.updateOne({ short: 'RCB' }, { $set: { captain: 'Mongosh Captain' } });
    await waitFor(async () => (await countFor(capPts)) === 1, 8000, 'direct update notification');
    expect(fieldsOf(await latestFor(capPts))).toEqual(['captain']);
    expect(await countFor(all)).toBe(1);
    expect(await countFor(winsOnly)).toBe(0); // captain is not one of their fields
  });

  it('an external script process (npm run update-team) also notifies', async () => {
    const url = new URL(process.env.MONGODB_URI!);
    url.pathname = `/${DB}`;
    const tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
    const { stdout } = await run(process.execPath, [tsx, 'src/scripts/updateTeam.ts', 'RCB', 'wins=77', 'points=154'], {
      env: { ...process.env, MONGODB_URI: url.toString() },
      timeout: 30000,
    });
    expect(stdout).toMatch(/updated/);
    await waitFor(async () => (await countFor(winsOnly)) === 1 && (await countFor(capPts)) === 1, 10000, 'script notifications');
    expect(fieldsOf(await latestFor(winsOnly))).toEqual(['wins']);
    expect(fieldsOf(await latestFor(capPts))).toEqual(['points']);
    expect(fieldsOf(await latestFor(all))).toEqual(['wins', 'points']);
  }, 60000);

  it('a change to a field nobody subscribed to, or a no-op update, creates nothing for them', async () => {
    await Team.collection.updateOne({ short: 'RCB' }, { $set: { headCoach: 'Someone New' } });
    await waitFor(async () => (await countFor(all)) === 1, 8000, 'headCoach notification');
    await sleep(500);
    expect(await countFor(capPts)).toBe(0);
    expect(await countFor(winsOnly)).toBe(0);

    const rcb = (await Team.findOne({ short: 'RCB' }).lean())!;
    await Team.collection.updateOne({ short: 'RCB' }, { $set: { captain: rcb.captain } }); // same value
    await sleep(800);
    expect(await Notification.countDocuments()).toBe(1); // still only the headCoach one
  });

  it('a replayed change event never creates duplicates', async () => {
    const rcb = (await Team.findOne({ short: 'RCB' }).lean())!;
    const event = {
      eventId: 'replayed-event-1',
      teamId: rcb._id as Types.ObjectId,
      teamShort: 'RCB',
      teamName: rcb.name,
      changes: [{ field: 'wins' as const, label: 'Wins', to: 9 }],
    };
    const first = await createTeamChangeNotifications(event);
    const second = await createTeamChangeNotifications(event);
    expect(first.length).toBe(2); // all + winsOnly
    expect(second.length).toBe(0);
    expect(await Notification.countDocuments({ eventId: 'replayed-event-1' })).toBe(2);
  });
});

describe('saved notifications + read state', () => {
  it('a user who is logged out still gets the notification on next login', async () => {
    // capPts has no open WebSocket (offline). Change happens; then they "log in again".
    await Team.collection.updateOne({ short: 'RCB' }, { $set: { captain: 'While You Were Away', points: 99 } });
    await waitFor(async () => (await countFor(capPts)) === 1, 8000, 'offline notification');

    const login = await s.api().post('/api/auth/login').send({ identifier: capPts.username, password: capPts.password });
    const res = await s.api().get('/api/notifications').set(auth({ token: login.body.token }));
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(1);
    const [n] = res.body.notifications;
    expect(n).toMatchObject({ type: 'team_update', read: false, teamShort: 'RCB' });
    expect(n.changes.map((c: { field: string; value: unknown }) => [c.field, c.value])).toEqual([
      ['captain', 'While You Were Away'],
      ['points', 99],
    ]);
    expect(n.eventId).toBeUndefined(); // internal field not exposed
  });

  it('mark one read, mark all read, unread filter, ownership and paging', async () => {
    for (let i = 1; i <= 3; i += 1) {
      await Team.collection.updateOne({ short: 'RCB' }, { $set: { wins: 200 + i } });
      await waitFor(async () => (await countFor(winsOnly)) === i, 8000, `notification ${i}`);
    }
    const list = await s.api().get('/api/notifications?limit=2').set(auth(winsOnly));
    expect(list.body.notifications).toHaveLength(2);
    expect(list.body.unreadCount).toBe(3);
    expect(list.body.nextCursor).toBeTruthy();
    const page2 = await s.api().get(`/api/notifications?limit=2&before=${list.body.nextCursor}`).set(auth(winsOnly));
    expect(page2.body.notifications).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();
    expect((await s.api().get('/api/notifications?before=not-an-id').set(auth(winsOnly))).status).toBe(400);

    const id = list.body.notifications[0].id;
    expect((await s.api().patch(`/api/notifications/${id}/read`).set(auth(other))).status).toBe(404); // not theirs
    expect((await s.api().patch('/api/notifications/not-an-id/read').set(auth(winsOnly))).status).toBe(404);
    const one = await s.api().patch(`/api/notifications/${id}/read`).set(auth(winsOnly));
    expect(one.body).toMatchObject({ unreadCount: 2, notification: { read: true } });

    const unread = await s.api().get('/api/notifications?unread=true').set(auth(winsOnly));
    expect(unread.body.notifications).toHaveLength(2);

    const allRead = await s.api().patch('/api/notifications/read-all').set(auth(winsOnly));
    expect(allRead.body).toEqual({ updated: 2, unreadCount: 0 });
    expect((await s.api().get('/api/notifications/unread-count').set(auth(winsOnly))).body.unreadCount).toBe(0);
    // other users' notifications are untouched
    expect(await Notification.countDocuments({ user: all.id, read: false })).toBe(3);
  });

  it('only the owner can list their notifications', async () => {
    await Team.collection.updateOne({ short: 'CSK' }, { $set: { titles: 7 } });
    await waitFor(async () => (await countFor(other)) === 1, 8000, 'CSK notification');
    const mine = await s.api().get('/api/notifications').set(auth(all));
    expect(mine.body.notifications.every((n: { teamShort: string }) => n.teamShort !== 'CSK')).toBe(true);
    expect((await s.api().get('/api/notifications')).status).toBe(401);
  });
});
