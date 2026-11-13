import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { Team } from '../src/models/Team';
import { User } from '../src/models/User';
import { ensureAdminFromEnv } from '../src/seed/seedAdmin';
import { auth, signup, signupAdmin, startTestServer, type TestServer, type TestUser } from './helpers';

let s: TestServer;
let admin: TestUser;
let fan: TestUser;
beforeAll(async () => {
  s = await startTestServer({ dbName: 'admin_api', changeStream: false });
  admin = await signupAdmin(s);
  fan = await signup(s);
});
afterAll(() => s.close());

describe('admin authorization', () => {
  it('401 without a token, 403 for a normal user, 200 for an admin', async () => {
    expect((await s.api().get('/api/admin/teams')).status).toBe(401);
    expect((await s.api().get('/api/admin/teams').set(auth(fan))).status).toBe(403);
    expect((await s.api().patch('/api/admin/teams/RCB').set(auth(fan)).send({ wins: 3 })).status).toBe(403);
    expect((await s.api().patch('/api/teams/RCB').set(auth(fan)).send({ wins: 3 })).status).toBe(403); // legacy route too

    const res = await s.api().get('/api/admin/teams').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.teams).toHaveLength(10);
  });

  it('a JWT that claims admin is not enough — the role is re-read from the database', async () => {
    await User.updateOne({ _id: admin.id }, { $set: { role: 'user' } });
    expect((await s.api().get('/api/admin/teams').set(auth(admin))).status).toBe(403);
    await User.updateOne({ _id: admin.id }, { $set: { role: 'admin' } });
  });
});

describe('PATCH /api/admin/teams/:id', () => {
  it('updates several fields in ONE request and reports what changed', async () => {
    const rcb = (await Team.findOne({ short: 'RCB' }).lean())!;
    const res = await s.api().patch(`/api/admin/teams/${rcb._id}`).set(auth(admin)).send({
      captain: 'New Captain', wins: rcb.wins + 1, points: rcb.points + 2, homeGround: rcb.homeGround,
    });
    expect(res.status).toBe(200);
    expect(res.body.changed).toEqual(['captain', 'wins', 'points']); // unchanged homeGround not written
    const now = (await Team.findById(rcb._id).lean())!;
    expect(now).toMatchObject({ captain: 'New Captain', wins: rcb.wins + 1, points: rcb.points + 2 });
  });

  it('accepts the short code as :id (case-insensitive)', async () => {
    const res = await s.api().patch('/api/admin/teams/csk').set(auth(admin)).send({ titles: 6 });
    expect(res.status).toBe(200);
    expect(res.body.team.short).toBe('CSK');
  });

  it('no-op update → 200 with changed: []', async () => {
    const mi = (await Team.findOne({ short: 'MI' }).lean())!;
    const res = await s.api().patch('/api/admin/teams/MI').set(auth(admin)).send({ captain: mi.captain });
    expect(res.status).toBe(200);
    expect(res.body.changed).toEqual([]);
  });

  it('validates input', async () => {
    const bad = await s.api().patch('/api/admin/teams/RCB').set(auth(admin)).send({
      wins: -1, points: 1.5, captain: '', short: 'XYZ', password: 'x',
    });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.errors).sort()).toEqual(['captain', 'password', 'points', 'short', 'wins']);
    expect((await s.api().patch('/api/admin/teams/RCB').set(auth(admin)).send({})).status).toBe(400);
    expect((await s.api().patch('/api/admin/teams/RCB').set(auth(admin)).send([1, 2])).status).toBe(400);
  });

  it('404 for an unknown team id or code, 409 for a duplicate name', async () => {
    expect((await s.api().patch('/api/admin/teams/ZZZ').set(auth(admin)).send({ wins: 1 })).status).toBe(404);
    expect((await s.api().patch('/api/admin/teams/0123456789abcdef01234567').set(auth(admin)).send({ wins: 1 })).status).toBe(404);
    const dup = await s.api().patch('/api/admin/teams/RCB').set(auth(admin)).send({ name: 'Mumbai Indians' });
    expect(dup.status).toBe(409);
  });
});

describe('admin account from .env (ensureAdminFromEnv)', () => {
  const original = { ...env.admin };
  afterAll(() => {
    env.admin = original;
  });

  it('skips when unset, refuses invalid/example settings', async () => {
    env.admin = { username: '', email: '', password: '', name: 'Admin' };
    expect(await ensureAdminFromEnv()).toBe('skipped');
    env.admin = { username: 'boss', email: '', password: '', name: 'Admin' };
    expect(await ensureAdminFromEnv()).toBe('invalid');
    env.admin = { username: 'boss', email: '', password: 'change-me-admin-password', name: 'Admin' };
    expect(await ensureAdminFromEnv()).toBe('invalid');
    env.admin = { username: 'boss', email: '', password: 'short', name: 'Admin' };
    expect(await ensureAdminFromEnv()).toBe('invalid');
    expect(await User.exists({ username: 'boss' })).toBeNull();
  });

  it('creates the admin from ADMIN_USERNAME + ADMIN_PASSWORD, idempotently', async () => {
    env.admin = { username: 'boss', email: '', password: 'Sup3r-secret-pw', name: 'The Boss' };
    expect(await ensureAdminFromEnv()).toBe('created');
    expect(await ensureAdminFromEnv()).toBe('exists');
    const res = await s.api().post('/api/auth/login').send({ identifier: 'boss', password: 'Sup3r-secret-pw' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'boss', role: 'admin', email: 'boss@admin.local' });
    expect((await s.api().get('/api/admin/teams').set(auth({ token: res.body.token }))).status).toBe(200);
  });

  it('promotes an existing user without changing their password', async () => {
    const u = await signup(s);
    env.admin = { username: u.username, email: '', password: 'a-different-password', name: 'Admin' };
    expect(await ensureAdminFromEnv()).toBe('promoted');
    const ok = await s.api().post('/api/auth/login').send({ identifier: u.username, password: u.password });
    expect(ok.body.user.role).toBe('admin');
    const wrong = await s.api().post('/api/auth/login').send({ identifier: u.username, password: 'a-different-password' });
    expect(wrong.status).toBe(401);
  });
});
