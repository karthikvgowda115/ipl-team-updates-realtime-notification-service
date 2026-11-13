import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { User } from '../src/models/User';
import { auth, signup, startTestServer, type TestServer } from './helpers';

let s: TestServer;
beforeAll(async () => {
  s = await startTestServer({ dbName: 'auth', changeStream: false });
});
afterAll(() => s.close());

describe('POST /api/auth/register', () => {
  it('creates a user, returns a JWT and never the password hash', async () => {
    const res = await s.api().post('/api/auth/register').send({
      name: 'Asha', username: 'Asha_01', email: 'Asha@Example.test', password: 'Passw0rd!x',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Asha', username: 'asha_01', email: 'asha@example.test', role: 'user' });
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/); // no bcrypt hash anywhere
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(payload).toMatchObject({ sub: res.body.user.id, role: 'user' });

    const stored = await User.findOne({ email: 'asha@example.test' }).select('+password').lean();
    expect(stored!.password).toMatch(/^\$2[aby]\$12\$/); // bcrypt, 12 rounds
  });

  it('public signup can never create an admin', async () => {
    const res = await s.api().post('/api/auth/register').send({
      name: 'Mallory', username: 'mallory', email: 'm@example.test', password: 'Passw0rd!x', role: 'admin',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
  });

  it('rejects missing/invalid input with per-field errors', async () => {
    const res = await s.api().post('/api/auth/register').send({ name: 'A', username: 'x', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['email', 'name', 'password', 'username']);
    expect((await s.api().post('/api/auth/register').send({})).status).toBe(400);
  });

  it('rejects duplicate email and duplicate username (case-insensitive) with 409', async () => {
    const u = await signup(s);
    const dupEmail = await s.api().post('/api/auth/register').send({
      name: 'Dup', username: 'someone_new', email: u.email.toUpperCase(), password: 'Passw0rd!x',
    });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.errors.email).toBeDefined();
    const dupUser = await s.api().post('/api/auth/register').send({
      name: 'Dup', username: u.username.toUpperCase(), email: 'other@example.test', password: 'Passw0rd!x',
    });
    expect(dupUser.status).toBe(409);
    expect(dupUser.body.errors.username).toBeDefined();
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with username or email', async () => {
    const u = await signup(s);
    for (const identifier of [u.username, u.email, u.username.toUpperCase()]) {
      const res = await s.api().post('/api/auth/login').send({ identifier, password: u.password });
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(u.id);
      expect(res.body.user.password).toBeUndefined();
    }
    // older clients that send { email }
    expect((await s.api().post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(200);
  });

  it('returns the same 401 for a wrong password and an unknown user', async () => {
    const u = await signup(s);
    const wrong = await s.api().post('/api/auth/login').send({ identifier: u.username, password: 'wrong-password' });
    const unknown = await s.api().post('/api/auth/login').send({ identifier: 'nobody_here', password: 'whatever123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('locks out brute force: 429 after 10 failed attempts for the same account; others unaffected', async () => {
    const u = await signup(s);
    for (let i = 0; i < 10; i += 1) {
      expect((await s.api().post('/api/auth/login').send({ identifier: u.username, password: `bad-${i}` })).status).toBe(401);
    }
    const blocked = await s.api().post('/api/auth/login').send({ identifier: u.username, password: u.password });
    expect(blocked.status).toBe(429); // even the right password, until the window ends
    expect(blocked.headers['retry-after']).toBeDefined();
    const other = await signup(s);
    expect((await s.api().post('/api/auth/login').send({ identifier: other.username, password: other.password })).status).toBe(200);
  });

  it('400 when fields are missing', async () => {
    const res = await s.api().post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['identifier', 'password']);
  });
});

describe('GET /api/auth/me (protected)', () => {
  it('returns the current user for a valid token', async () => {
    const u = await signup(s);
    const res = await s.api().get('/api/auth/me').set(auth(u));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: u.id, username: u.username, role: 'user' });
  });

  it('401 for missing, malformed, wrongly-signed and expired tokens', async () => {
    const u = await signup(s);
    expect((await s.api().get('/api/auth/me')).status).toBe(401);
    expect((await s.api().get('/api/auth/me').set({ Authorization: 'Bearer not.a.jwt' })).status).toBe(401);
    const forged = jwt.sign({ sub: u.id, role: 'admin' }, 'some-other-secret');
    expect((await s.api().get('/api/auth/me').set({ Authorization: `Bearer ${forged}` })).status).toBe(401);
    const expired = jwt.sign({ sub: u.id, role: 'user' }, process.env.JWT_SECRET!, { expiresIn: -10 });
    expect((await s.api().get('/api/auth/me').set({ Authorization: `Bearer ${expired}` })).status).toBe(401);
  });

  it('401 when the account was deleted after the token was issued', async () => {
    const u = await signup(s);
    await User.deleteOne({ _id: u.id });
    expect((await s.api().get('/api/auth/me').set(auth(u))).status).toBe(401);
  });
});
