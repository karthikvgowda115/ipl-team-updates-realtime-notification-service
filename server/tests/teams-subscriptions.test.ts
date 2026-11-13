import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Subscription } from '../src/models/Subscription';
import { TEAM_FIELDS, Team } from '../src/models/Team';
import { auth, signup, startTestServer, type TestServer, type TestUser } from './helpers';

let s: TestServer;
let u: TestUser;
beforeAll(async () => {
  s = await startTestServer({ dbName: 'teams', changeStream: false });
  u = await signup(s);
});
afterAll(() => s.close());

describe('teams', () => {
  it('the 10 IPL teams are seeded with every required field', async () => {
    const res = await s.api().get('/api/teams').set(auth(u));
    expect(res.status).toBe(200);
    expect(res.body.teams).toHaveLength(10);
    expect(res.body.teams.map((t: { short: string }) => t.short).sort()).toEqual(
      ['CSK', 'DC', 'GT', 'KKR', 'LSG', 'MI', 'PBKS', 'RCB', 'RR', 'SRH'],
    );
    for (const t of res.body.teams) {
      for (const f of ['name', 'short', 'captain', 'headCoach', 'homeGround', 'titles', 'wins', 'losses', 'points']) {
        expect(t[f], `${t.short}.${f}`).toBeDefined();
      }
      expect(t).toMatchObject({ following: false, fields: null, followers: 0 });
    }
    expect(res.body.fieldOptions.map((o: { key: string }) => o.key)).toEqual([...TEAM_FIELDS]);
  });

  it('requires authentication', async () => {
    expect((await s.api().get('/api/teams')).status).toBe(401);
  });

  it('GET /api/teams/:id works with the id or the short code; 404/400 otherwise', async () => {
    const rcb = (await Team.findOne({ short: 'RCB' }).lean())!;
    const byId = await s.api().get(`/api/teams/${rcb._id}`).set(auth(u));
    const byShort = await s.api().get('/api/teams/rcb').set(auth(u));
    expect(byId.status).toBe(200);
    expect(byShort.body.team.id).toBe(String(rcb._id));
    expect((await s.api().get('/api/teams/NOPE').set(auth(u))).status).toBe(404);
    expect((await s.api().get('/api/teams/ffffffffffffffffffffffff').set(auth(u))).status).toBe(404);
    expect((await s.api().get(`/api/teams/${'x'.repeat(40)}`).set(auth(u))).status).toBe(400);
  });
});

describe('subscriptions', () => {
  it('subscribe (idempotent), list, multiple teams', async () => {
    const me = await signup(s);
    const rcb = (await Team.findOne({ short: 'RCB' }).lean())!;
    const first = await s.api().post('/api/subscriptions').set(auth(me)).send({ teamId: String(rcb._id) });
    expect(first.status).toBe(201);
    expect(first.body.subscription.fields).toEqual([...TEAM_FIELDS]); // default: everything
    const again = await s.api().post('/api/subscriptions').set(auth(me)).send({ teamId: 'RCB' });
    expect(again.status).toBe(200);
    await s.api().post('/api/teams/CSK/follow').set(auth(me)); // legacy route, same handler
    await s.api().post('/api/subscriptions').set(auth(me)).send({ teamId: 'MI', fields: ['captain'] });

    const list = await s.api().get('/api/subscriptions').set(auth(me));
    expect(list.body.subscriptions.map((x: { team: { short: string } }) => x.team.short).sort()).toEqual(['CSK', 'MI', 'RCB']);
    expect(await Subscription.countDocuments({ user: me.id })).toBe(3);

    const teams = await s.api().get('/api/teams').set(auth(me));
    const mi = teams.body.teams.find((t: { short: string }) => t.short === 'MI');
    expect(mi).toMatchObject({ following: true, fields: ['captain'], followers: 1 });
  });

  it('POST validates teamId and fields', async () => {
    expect((await s.api().post('/api/subscriptions').set(auth(u)).send({})).status).toBe(400);
    expect((await s.api().post('/api/subscriptions').set(auth(u)).send({ teamId: 'ZZZ' })).status).toBe(404);
    const badFields = await s.api().post('/api/subscriptions').set(auth(u)).send({ teamId: 'GT', fields: ['password'] });
    expect(badFields.status).toBe(400);
    expect(await Subscription.exists({ user: u.id })).toBeNull();
  });

  it('PATCH /api/subscriptions/:teamId selects fields (deduped, standard order)', async () => {
    const me = await signup(s);
    await s.api().post('/api/subscriptions').set(auth(me)).send({ teamId: 'RCB' });
    const res = await s.api().patch('/api/subscriptions/RCB').set(auth(me)).send({ fields: ['points', 'captain', 'points'] });
    expect(res.status).toBe(200);
    expect(res.body.subscription.fields).toEqual(['captain', 'points']);
    expect((await s.api().patch('/api/subscriptions/RCB').set(auth(me)).send({ fields: [] })).status).toBe(400);
    expect((await s.api().patch('/api/subscriptions/RCB').set(auth(me)).send({ fields: ['bogus'] })).status).toBe(400);
    expect((await s.api().patch('/api/subscriptions/CSK').set(auth(me)).send({ fields: ['wins'] })).status).toBe(404); // not following
  });

  it('DELETE unsubscribes (idempotent) and only touches your own subscription', async () => {
    const a = await signup(s);
    const b = await signup(s);
    await s.api().post('/api/subscriptions').set(auth(a)).send({ teamId: 'KKR' });
    await s.api().post('/api/subscriptions').set(auth(b)).send({ teamId: 'KKR' });

    const del = await s.api().delete('/api/subscriptions/KKR').set(auth(a));
    expect(del.status).toBe(200);
    expect(del.body.following).toBe(false);
    expect((await s.api().delete('/api/subscriptions/KKR').set(auth(a))).status).toBe(200); // again: still 200

    const kkr = (await Team.findOne({ short: 'KKR' }).lean())!;
    expect(await Subscription.exists({ user: a.id, team: kkr._id })).toBeNull();
    expect(await Subscription.exists({ user: b.id, team: kkr._id })).not.toBeNull(); // B unaffected
  });
});
