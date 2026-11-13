import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Match } from '../src/models/Match';
import { bowlBall, createMatch, startSecondInnings } from '../src/simulator/engine';
import { squadFor } from '../src/simulator/squads';
import { auth, connect, signup, signupAdmin, startTestServer, waitFor, WsClient, type TestServer, type TestUser } from './helpers';

describe('simulator engine', () => {
  const team = (short: string) => ({ team: new Types.ObjectId(), short, name: short, homeGround: 'Ground', squad: squadFor(short, 'Captain X') });

  it('plays complete matches with consistent scorecards', () => {
    for (let m = 0; m < 100; m += 1) {
      const overs = m % 4 === 0 ? 5 : 20;
      const st = createMatch(team('RCB'), team('CSK'), overs, new Types.ObjectId());
      for (let guard = 0; st.status !== 'completed' && guard < 1000; guard += 1) {
        if (st.status === 'innings_break') startSecondInnings(st);
        else bowlBall(st);
      }
      expect(st.status).toBe('completed');
      expect(st.result).toBeTruthy();
      for (const inn of st.innings) {
        const batRuns = inn.batters.reduce((n, b) => n + b.runs, 0);
        expect(batRuns + inn.extras).toBe(inn.runs);
        expect(inn.bowlers.reduce((n, b) => n + b.runs, 0)).toBe(inn.runs);
        expect(inn.bowlers.reduce((n, b) => n + b.balls, 0)).toBe(inn.balls);
        expect(inn.balls).toBeLessThanOrEqual(overs * 6);
        expect(inn.batters.filter((b) => b.status === 'out')).toHaveLength(inn.wickets);
        expect(inn.bowlers.every((b) => b.balls <= Math.ceil(overs / 5) * 6)).toBe(true); // bowler quota
        expect(inn.thisOver.every((b) => /^(•|[1-6]|W|wd|nb(\+\d)?)$/.test(b))).toBe(true);
      }
    }
  });
});

describe('live score over WebSocket', () => {
  let s: TestServer;
  let admin: TestUser;
  let fan: TestUser;
  beforeAll(async () => {
    s = await startTestServer({ dbName: 'live', changeStream: false });
    admin = await signupAdmin(s);
    fan = await signup(s);
  });
  afterAll(() => s.close());

  it('only admins can start a match', async () => {
    expect((await s.api().post('/api/matches/start').set(auth(fan)).send({})).status).toBe(403);
    expect((await s.api().post('/api/matches/start').set(auth(admin)).send({ teams: ['RCB', 'RCB'] })).status).toBe(400);
    expect((await s.api().post('/api/matches/start').set(auth(admin)).send({ overs: 99 })).status).toBe(400);
  });

  it('simulator → MongoDB → WebSocket: every ball reaches public and logged-in subscribers', async () => {
    const pub = new WsClient(`${s.wsUrl}/api/ws/live`); // public, read-only
    await pub.opened();
    const user = await connect(s, fan);
    user.send({ type: 'subscribe', channel: 'score' });
    const notSubscribed = await connect(s, admin); // logged in but not on the score channel

    const start = await s.api().post('/api/matches/start').set(auth(admin)).send({ teams: ['RCB', 'CSK'], overs: 1 });
    expect(start.status).toBe(201);
    const id = start.body.match.id;

    const ours = (c: WsClient) => c.of('score:update').filter((m) => m.live?.matchId === id);
    await waitFor(() => ours(pub).some((m) => m.live.status === 'completed'), 30000, 'match to finish');

    const live = ours(pub).filter((m) => m.live.status === 'live' && m.live.bowler).at(-1)!.live;
    expect(live).toMatchObject({ totalOvers: 1, battingTeam: { short: expect.any(String) }, bowlingTeam: { short: expect.any(String) } });
    expect(['RCB', 'CSK']).toContain(live.battingTeam.short);
    expect(live.battingTeam.short).not.toBe(live.bowlingTeam.short);
    expect(typeof live.runs).toBe('number');
    expect(typeof live.wickets).toBe('number');
    expect(live.overs).toMatch(/^\d+\.[0-5]$/);
    expect(live.batters.length).toBeGreaterThanOrEqual(1);
    for (const b of live.batters) expect(b).toEqual(expect.objectContaining({ name: expect.any(String), runs: expect.any(Number), balls: expect.any(Number), onStrike: expect.any(Boolean) }));
    expect(live.batters.filter((b: { onStrike: boolean }) => b.onStrike).length).toBeLessThanOrEqual(1);
    expect(live.bowler).toEqual(expect.objectContaining({ name: expect.any(String), overs: expect.stringMatching(/^\d+\.[0-5]$/), runs: expect.any(Number), wickets: expect.any(Number) }));
    expect(Array.isArray(live.thisOver)).toBe(true);

    const versions = ours(pub).map((m) => m.match.ballsBowled);
    expect(versions.every((v, i) => i === 0 || v >= versions[i - 1])).toBe(true); // in order, ball by ball
    await waitFor(() => ours(user).some((m) => m.live.status === 'completed'), 5000, 'user socket');
    expect(ours(notSubscribed)).toHaveLength(0);

    const saved = await Match.findById(id).lean();
    expect(saved?.status).toBe('completed');
    const current = await s.api().get('/api/matches/current').set(auth(fan));
    expect(current.body.live.matchId).toBe(id);
    expect(current.body.match.result).toBe(saved?.result);

    pub.send('hello');
    await waitFor(() => pub.of('error').length > 0, 2000, 'read-only error');
    [pub, user, notSubscribed].forEach((c) => c.close());
  }, 60000);
});
