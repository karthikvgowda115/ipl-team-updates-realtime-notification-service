# IPL Team Updates – Real-time Notification Service

MERN + TypeScript app: follow IPL teams and get real-time notifications when team data
changes in MongoDB (via Change Streams), plus a live match scorecard over WebSocket.

> **Status:** all assignment requirements implemented and covered by an automated test suite
> (`cd server && npm test` — 46 integration tests against an in-memory MongoDB replica set).

## Requirements checklist
| # | Requirement | Where |
|---|-------------|-------|
| 1 | Register / log in with token auth | `POST /api/auth/register` (username + email), `POST /api/auth/login` (username **or** email, JWT HS256), `GET /api/auth/me` · `/signup`, `/login` · admins: `/admin/login` |
| 2 | 10 IPL teams in MongoDB (`name, short, captain, headCoach, homeGround, titles, wins, losses, points`) | `models/Team.ts`, auto-seeded (`npm run seed`) · `GET /api/teams`, `GET /api/teams/:id` |
| 3 | Subscribe / unsubscribe to one or more teams, persisted | `POST /api/subscriptions`, `DELETE /api/subscriptions/:teamId` (also `/api/teams/:short/follow`) · `subscriptions` collection · dashboard + `/teams` |
| 4 | Real-time push without refresh | WebSocket `/api/ws` → `notification:new` ([details](#real-time-websocket)) |
| 5 | Every notification saved; ones created while logged out shown on next login | `notifications` collection · `GET /api/notifications` · dashboard panel |
| 6 | Unread by default; endpoint to mark all read | `PATCH /api/notifications/read-all` (also `PATCH /api/notifications/:id/read`) |
| 7 | Protected admin endpoint to update teams; direct MongoDB changes also notify | `GET /api/admin/teams`, `PATCH /api/admin/teams/:id` (JWT + admin role; see [Admin users](#admin-users)) · `/admin/dashboard` · Change Stream on `teams` · `npm run update-team`, mongosh |
| 8 | One update with several fields → ONE grouped notification | `change-stream/diffTeamChange.ts` + `services/notification.service.ts` |
| 9 | Live score WebSocket (teams, runs/wickets, overs "15.3" of 20, batters + strike, bowler, this over) | `/api/ws/live` (public) or `/api/ws` channel `score` → `score:update.live` ([format](#live-score)) · `/live` page |
| 10 | Field-level subscriptions (brownie points) | `PATCH /api/subscriptions/:teamId { fields }` · "Notify me about" on the dashboard and `/teams` |

## Quick test (as a reviewer)
1. `cp .env.example .env`, set `MONGODB_URI`, `JWT_SECRET` and **`ADMIN_USERNAME` + `ADMIN_PASSWORD`** (your own password),
   then `docker compose up --build -d` → http://localhost:3000. The admin account is created on startup
   (log: `[admin] Admin account created`).
2. Admin: http://localhost:3000/admin/login → **Admin dashboard** (team table). In another browser / private window, **sign up** a fan.
3. As the fan, on the **Dashboard**: *Discover teams* → **+ Follow** RCB, then under *Teams you follow* → **Edit** "Notify me about" (e.g. only Captain + Points).
4. Change RCB any of these ways — the fan's dashboard shows ONE grouped notification instantly, and team values update live:
   - Admin UI: **Admin dashboard** → RCB → **✎ Edit** (change several fields → one request)
   - API: `curl -X PATCH localhost:5000/api/admin/teams/RCB -H "Authorization: Bearer <admin token>" -H "Content-Type: application/json" -d '{"captain":"New Captain","wins":10,"points":20}'`
   - Script: `docker compose exec server npm run update-team:prod -- RCB captain="New Captain" wins=10 points=20`
   - mongosh: `db.teams.updateOne({ short: "RCB" }, { $set: { captain: "New Captain", wins: 10, points: 20 } })`
5. Log the fan out, change RCB again, log back in → the notification is waiting (unread). **Mark all read** clears it.
6. Live score: the dashboard's **Live scorecard**, the full **Live** page, or `npx wscat -c ws://localhost:5000/api/ws/live`.

## Tests & quality checks
```bash
cd server
npm test            # 46 integration tests (Vitest + Supertest + real WebSockets) on an in-memory
                    # MongoDB replica set — first run downloads a MongoDB binary; never touches Atlas
npm run typecheck   # source + tests
npm run lint
npm run build
cd ../client
npm run lint
npm run build       # tsc -b + vite build
```
The suites cover: signup/login (username or email), invalid/expired/forged JWTs, brute-force lockout,
403 on admin APIs for users, admin multi-field updates, subscriptions (multiple teams, field selection,
ownership), Change Stream notifications from the **admin API, a direct MongoDB update and an external
script process**, ONE grouped notification per update, field filtering, offline persistence + next-login
retrieval, mark read / read-all, WebSocket auth / delivery isolation / disconnect + reconnect, and the
simulator → MongoDB → WebSocket live score (public and authenticated).

## Stack
| Layer    | Tech |
|----------|------|
| Frontend | React, TypeScript, Vite, Axios, native WebSocket (served by nginx in Docker) |
| Backend  | Node.js, Express, TypeScript, Mongoose, ws, MongoDB Change Streams |
| Database | MongoDB Atlas (hosted — **no** Mongo container) |
| DevOps   | Docker, Docker Compose |

## Structure
```text
ipl-team-updates/
├── client/                 React + Vite + TS frontend
│   ├── src/api/client.ts   Axios instance (baseURL /api)
│   ├── nginx.conf          Serves the build, proxies /api → server
│   └── Dockerfile          Build with Node, serve with nginx
├── server/                 Express + TS backend
│   ├── src/
│   │   ├── config/         env loading + MongoDB Atlas connection
│   │   ├── models/         Mongoose models (User, Team, Subscription, Notification)
│   │   ├── controllers/    Request handlers
│   │   ├── services/       Business logic
│   │   ├── routes/         Express routers
│   │   ├── middleware/     Auth / error middleware
│   │   ├── websocket/      WebSocket server
│   │   ├── change-stream/  MongoDB Change Stream watchers
│   │   ├── simulator/      Live match simulator
│   │   ├── seed/           Seed data (10 IPL teams) + admin from .env
│   │   ├── scripts/        CLI: make-admin, update-team
│   │   ├── types/          Shared TS types
│   │   ├── app.ts          Express app (middleware + routes)
│   │   └── server.ts       Entry point: HTTP server + DB connect
│   ├── tests/              Vitest integration tests (in-memory MongoDB replica set)
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Setup
1. Create a MongoDB Atlas cluster, a database user, and allow your IP in **Network Access**
   (use `0.0.0.0/0` for development if running in Docker).
2. Copy env file and set `MONGODB_URI`, `JWT_SECRET` and the admin account:
   ```bash
   cp .env.example .env
   ```

## Admin users
Sign-up always creates a normal **user** (a `role` sent in the signup body is ignored). Admins come from:
- **`.env` (recommended):** `ADMIN_USERNAME` + `ADMIN_PASSWORD` (min 8 chars, not the example value), optional
  `ADMIN_EMAIL` (default `<username>@admin.local`) and `ADMIN_NAME`. On every start the server makes sure this admin
  exists: it is created (bcrypt, same validation as signup), or — if that username/email already signed up — promoted
  to admin **without changing their password**. Also run by `npm run seed`. The password is never logged.
- **`npm run make-admin -- <username|email>`** promotes any existing user (`--revoke` to demote;
  Docker: `docker compose exec server npm run make-admin:prod -- <username>`). The user logs in again to get an admin token.

Admins log in at **/admin/login** (non-admin accounts are refused there) and manage teams on **/admin/dashboard**.
Every admin API checks the JWT **and** re-reads the role from the database (`requireAuth` → `requireRole('admin')`),
so a demoted admin loses access immediately; normal users get **403**.

## Run with Docker
```bash
docker compose up --build -d     # build + start
docker compose logs -f server    # watch API logs (look for "Connected to MongoDB Atlas")
docker compose down              # stop
```
- Frontend: http://localhost:3000
- API health: http://localhost:5000/health

## Run locally (without Docker)
```bash
cd server && npm install && npm run dev     # http://localhost:5000
cd client && npm install && npm run dev     # http://localhost:5173 (proxies /api → :5000)
```

## Register a user
`POST /api/auth/register` (UI: http://localhost:3000/signup)
```json
{ "name": "Test Fan", "username": "test_fan", "email": "fan@example.com", "password": "secret123" }
```
| Status | When |
|--------|------|
| 201 | Created and logged in → `{ "message", "token", "user": { "id", "name", "username", "email", "role": "user", "createdAt", "updatedAt" } }` |
| 400 | Validation failed → `{ "message", "errors": { "name"?, "username"?, "email"?, "password"? } }` (name 2–50 chars, username 3–30 letters/digits/`.`/`_`, valid email, password 8–72 chars) |
| 409 | Email or username already registered (both stored lower-case → case-insensitive) |
| 503 | MongoDB not connected |

Passwords are hashed with bcrypt (12 rounds), stored in a `select: false` field and never returned by the API.
(Accounts created before usernames existed keep working and log in with their email.)

## Log in
`POST /api/auth/login` (UI: http://localhost:3000/login, admins: /admin/login)
```json
{ "identifier": "test_fan", "password": "secret123" }
```
`identifier` is the username **or** the email (`{ "email": … }` / `{ "username": … }` also work).

| Status | When |
|--------|------|
| 200 | `{ "token", "user" }` |
| 400 | identifier/password missing |
| 401 | `Invalid username/email or password` (same message for unknown user and wrong password) |
| 429 | 10 failed attempts for that account from the same IP within 15 min (`Retry-After` header) |

## Authenticated requests
Send the JWT as `Authorization: Bearer <token>`.
- `GET /api/auth/me` → `{ "user" }` — 401 if the token is missing, invalid, expired, or the user was deleted.
- Tokens are HS256, signed with `JWT_SECRET`, valid for `JWT_EXPIRES_IN` (default `7d`). Payload: `{ sub: userId, role }`.
- Server: protect a route with `requireAuth` (and `requireRole('admin')` for admin-only) from `server/src/middleware/auth.ts`.

### Client auth flow
- Token is stored in `localStorage` (`ipl.token`); an Axios interceptor adds it to every request.
- On page load, a stored token is checked with `/api/auth/me` to restore the session.
- Any 401 on an authenticated request logs the user out (e.g. expired token).
- Routes: `/login`, `/signup` (logged-out only) → `/dashboard` (logged-in only). Visiting a protected page while logged out redirects to `/login` and returns there after login.

## Teams
The 10 IPL teams (`name, short, captain, headCoach, homeGround, titles, wins, losses, points`) are
**seeded automatically** the first time the server connects to an empty database.
Captain/coach/titles reflect the IPL 2025 season; season stats start at 0. Edit `server/src/seed/teams.data.ts` as needed.

```bash
cd server && npm run seed                 # insert missing teams only (safe to re-run)
cd server && npm run seed -- --reset      # restore all teams to the seed values
docker compose exec server npm run seed:prod   # same, inside the Docker container
```
The seeder only writes real changes, so re-running it doesn't create no-op updates (which
would otherwise look like team changes to the Change Stream later).

All endpoints below require `Authorization: Bearer <token>`. Wherever a team is identified (`:id`, `:teamId`,
`teamId`), both its MongoDB id and its short code work (case-insensitive: `rcb` = `RCB`).

| Method | Path | Result |
|--------|------|--------|
| GET | `/api/teams` | `{ teams: [...], fieldOptions }` in points-table order; each team adds `followers`, `following` and your `fields` |
| GET | `/api/teams/:id` | `{ team }` — 404 if unknown |
| POST | `/api/subscriptions` `{ teamId, fields? }` | 201 now following · 200 already following (idempotent) |
| PATCH | `/api/subscriptions/:teamId` `{ fields }` | choose notification fields (see below) |
| DELETE | `/api/subscriptions/:teamId` | 200 `{ following: false }` (idempotent; only your own subscription) |
| GET | `/api/subscriptions` | `{ subscriptions: [{ id, team: {...}, fields, createdAt }] }`, newest first |

The original `POST|PATCH|DELETE /api/teams/:short/follow` routes still work (same handlers).

Subscriptions are stored in the `subscriptions` collection, one per (user, team), enforced by a unique index.
`fields` lists the team fields the user gets notified about; it defaults to all fields
(see **Field-level notifications** below).

UI: the **/dashboard** has a welcome + stats row, the live scorecard, notifications, *Teams you follow* (team stats,
"Notify me about", Unfollow) and *Discover teams* (Follow). **/teams** shows every team as a card.

## Health check
`GET /health` (also `/api/health`)
```json
{ "status": "ok", "service": "ipl-team-updates-server", "database": "connected", "changeStream": "watching", "uptime": 12, "timestamp": "..." }
```

## Notifications (Change Stream)
`server/src/change-stream/teamChangeStream.ts` watches the `teams` collection. Any update —
from the API, an admin, a script or **mongosh** — becomes ONE grouped notification per
follower, listing only the changed fields that follower subscribed to:
```text
RCB updated
Captain → New Captain
Wins → 10
Points → 20
```
The resume token is stored in `change_stream_state`, so changes made while the server was down
are processed on the next start. Each notification stores the change event id (unique per user),
so a replayed event never creates duplicates. Showing old → new values needs MongoDB pre-images,
which require `collMod` permission (Atlas role `dbAdmin`); without it notifications show new values only.

Try it from mongosh:
```js
db.teams.updateOne({ short: "RCB" }, { $set: { captain: "New Captain", wins: 10, points: 20 } })
```

### Admin: update teams
| Method | Path | Result |
|--------|------|--------|
| GET | `/api/admin/teams` | **admin only** · all teams with follower counts |
| PATCH | `/api/admin/teams/:id` `{ captain?, headCoach?, homeGround?, name?, titles?, wins?, losses?, points? }` | **admin only** · several fields in one request → 200 `{ team, changed }` · 400 per-field errors · 401/403 · 404 · 409 duplicate name |

(`PATCH /api/teams/:short` is kept as an alias with the same admin check.) Only fields whose value actually
changes are written, all in ONE MongoDB update, so followers get one grouped notification. The endpoint does
not create notifications itself — the Change Stream does, for API, script and mongosh changes alike, so
nothing is ever notified twice. Notifications are `{ type: "team_update", title, message, changes: [{ field, label, value, to }], read, createdAt }`.

```bash
cd server
npm run make-admin -- some_user                   # grant admin by username or email (--revoke to remove)
npm run update-team -- RCB captain="X" wins=10    # change a team directly in MongoDB (like mongosh)
# Docker: docker compose exec server npm run make-admin:prod -- some_user
#         docker compose exec server npm run update-team:prod -- RCB wins=10
```

Every team change is also broadcast as `team:update` to all logged-in tabs, so the Teams page and the dashboard
show the new values (highlighted) without a reload.

| Method | Path | Result |
|--------|------|--------|
| GET | `/api/notifications?limit=20&before=<id>&unread=true` | `{ notifications, unreadCount, nextCursor }`, newest first |
| GET | `/api/notifications/unread-count` | `{ unreadCount }` |
| PATCH | `/api/notifications/:id/read` | `{ notification, unreadCount }` (404 if not yours) |
| PATCH | `/api/notifications/read-all` | `{ updated, unreadCount: 0 }` |

## Field-level notifications
Each subscription has `fields` (default: all). On the **dashboard** (and **/teams**), a followed team shows
"Notify me about: …" with an **Edit** button to tick fields (Captain, Points, …).

| Method | Path | Result |
|--------|------|--------|
| POST | `/api/subscriptions` `{ teamId, fields? }` | follow; optional fields for a new subscription |
| PATCH | `/api/subscriptions/:teamId` `{ fields: ["captain","points"] }` | 200 · 400 empty/unknown field · 404 not following |

`GET /api/teams` returns each team's `fields` (null if not following) and `fieldOptions` (`[{ key, label }]`).
Example: following RCB with `captain, points` → a wins-only change sends nothing; captain + wins + points
→ one notification listing captain + points.

## Real-time (WebSocket)
One WebSocket per browser tab, on the **same port** as the API at `/api/ws`
(Vite proxies it in dev, nginx in Docker — both already forward the `Upgrade` headers).

```text
Team change in MongoDB ─► Change Stream ─► notification.service (saves to MongoDB)
                                              │ notificationEvents 'created'
                                              ▼
Browser ◄── notification:new ── WebSocket server (looks up that user's open sockets)
```
1. The browser opens `ws(s)://<host>/api/ws` and sends `{ "type": "auth", "token": "<JWT>" }` as its
   first message (never in the URL, so it isn't logged). Not authenticated within 10s → closed with **4001**.
2. The server verifies the JWT, loads the user and replies `{ "type": "auth:ok" }`. It keeps
   `userId → set of sockets`, so every tab/device of that user receives pushes.
3. When a notification is saved, the service emits an in-process event; the WebSocket layer sends
   `{ type: "notification:new", notification, unreadCount }` to that user's sockets only.
   Marking read sends `notification:read` to the user's other tabs.
4. The server pings every 30s and drops sockets that don't answer. A socket is closed with **4002**
   when its JWT expires (the client then logs out).
5. The client reconnects with exponential backoff (1s → 30s, with jitter) and **re-fetches notifications
   after every (re)connect**, because anything created while offline was saved in MongoDB but not pushed.
   While disconnected, the dashboard falls back to polling every 30s.

Messages: client → `auth`, `subscribe {channel:"score"}`, `unsubscribe`; server → `auth:ok`,
`notification:new`, `notification:read`, `score:update`, `error`. See `server/src/websocket/protocol.ts`.

## Live score
`server/src/simulator/` plays simulated T20 matches ball by ball (realistic run/wicket odds,
bowler quotas, strike rotation, chase and result). After every ball the full state is saved to the
`matches` collection (so a restart resumes the match) and broadcast as `score:update`.

Two ways to receive it:
- **Public, read-only:** `ws://localhost:5000/api/ws/live` (Docker UI: `ws://localhost:3000/api/ws/live`) — no auth,
  sends the current score on connect and then every ball. Try `npx wscat -c ws://localhost:5000/api/ws/live`.
- **In the app:** the authenticated `/api/ws` socket after `{ "type": "subscribe", "channel": "score" }`.

Every message:
```json
{
  "type": "score:update",
  "live": {
    "title": "KKR vs DC", "status": "live", "innings": 2,
    "battingTeam": { "short": "DC", "name": "Delhi Capitals" },
    "bowlingTeam": { "short": "KKR", "name": "Kolkata Knight Riders" },
    "runs": 154, "wickets": 6, "overs": "17.4", "totalOvers": 20,
    "batters": [
      { "name": "Vipraj Nigam", "runs": 31, "balls": 12, "fours": 4, "sixes": 1, "onStrike": true },
      { "name": "Tristan Stubbs", "runs": 47, "balls": 31, "fours": 6, "sixes": 1, "onStrike": false }
    ],
    "bowler": { "name": "Varun Chakaravarthy", "overs": "3.4", "runs": 30, "wickets": 1 },
    "thisOver": ["6", "1", "•", "4"],
    "target": 167, "required": { "runs": 13, "balls": 14 },
    "lastBall": "Varun Chakaravarthy to Vipraj Nigam, FOUR!", "result": null
  },
  "match": { "...": "full state: both innings' batting/bowling cards, fall of wickets, commentary" }
}
```
Ball symbols: `•` dot, `1`–`6` runs, `W` wicket, `wd` wide, `nb` / `nb+4` no-ball. **/live** shows the scorecard: scores, chase equation, run rates,
batters at the crease, current bowler, this over, full batting/bowling cards, fall of wickets and commentary.

| Method | Path | Result |
|--------|------|--------|
| GET | `/api/matches/current` | `{ live, match }` — live match, or the last result |
| POST | `/api/matches/start` `{ teams?: ["RCB","CSK"], overs?: 20 }` | **admin** · starts a new match now |

Settings (`.env`): `SIMULATOR_ENABLED`, `SIM_OVERS`, `SIM_BALL_INTERVAL_MS`, `SIM_INNINGS_BREAK_MS`,
`SIM_MATCH_BREAK_MS`, `SIM_UPDATE_STANDINGS` (true = a finished match updates wins/losses/points,
which flows through the Change Stream into notifications). The simulator assumes a single server instance.
Admins: see [Admin users](#admin-users).
