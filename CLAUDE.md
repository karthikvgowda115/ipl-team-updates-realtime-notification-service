# IPL Team Updates – Real-time Notification Service

## Working rules (IMPORTANT)
- Build in phases. **Do not start any phase until the user explicitly says so.**
- Do not proceed to the next phase until the user asks.
- Current status: **Phase 3 complete (2026-11-12)** — Phase 2: Signup page, `User` model, `POST /api/auth/register`. Phase 3: Login page, `POST /api/auth/login`, JWT (HS256, `JWT_SECRET`/`JWT_EXPIRES_IN`), `GET /api/auth/me`, `requireAuth`/`requireRole` middleware, client `AuthContext` (token in localStorage), protected `/dashboard` placeholder.
  **Phases 4+5 complete (2026-11-12)** — `Team` model (+ `TEAM_FIELDS`), 10 teams seeded (auto on empty DB; `npm run seed [-- --reset]`, writes only real changes so no phantom change-stream events), `GET /api/teams[/:short]`; `Subscription` model (unique user+team, `fields` defaults to all TEAM_FIELDS for later field-level subs), `POST/DELETE /api/teams/:short/follow` (idempotent), `GET /api/subscriptions`; React `/teams` page + dashboard "Teams you follow".
  **Phases 6+7 complete (2026-11-12)** — `Notification` model (grouped `changes[]`, `eventId` unique per user for idempotency); `GET /api/notifications[?limit&before&unread=true]` (cursor paging), `GET /unread-count`, `PATCH /:id/read`, `PATCH /read-all`; dashboard `NotificationsPanel` (polls every 15s until the WebSocket phase). Change stream on `teams` (`change-stream/teamChangeStream.ts`): update/replace → `diffTeamChange` → one grouped notification per follower filtered by `Subscription.fields`; resume token saved in `change_stream_state` (survives restarts); emits on `notificationEvents` for the WebSocket phase. Pre-images need `collMod` permission (current Atlas user lacks it → new values only).
  **Phases 8–10 complete (2026-11-12)** — WebSocket (`ws`) on the same HTTP server at `/api/ws` (`websocket/protocol.ts`, `wsServer.ts`, `index.ts`): JWT sent as first message, per-user socket sets, heartbeat, close 4001/4002/4400; pushes `notification:new`/`notification:read`, `score` channel → `score:update`. Client `realtime/` (RealtimeClient with backoff reconnect, RealtimeProvider, toasts); panel refetches on (re)connect, polls only while disconnected. Field-level: `PATCH /api/teams/:short/follow {fields}`, `GET /api/teams` returns `fields` + `fieldOptions`, `FieldPicker` on team cards. Live score: `Match` model, `simulator/` (pure `engine.ts`, `matchSimulator.ts` saves state each ball & resumes on restart), `GET /api/matches/current`, admin `POST /api/matches/start`, `/live` page; `SIM_*` env vars (`SIM_UPDATE_STANDINGS` default false).
  **Spec gap fixes (2026-11-12)** — admin `PATCH /api/teams/:short` (validated, writes only changed fields in one update; notifications still come only from the Change Stream); `npm run make-admin -- <email>` and `npm run update-team -- RCB field=value` (+ `:prod` variants); `team:update` broadcast to all logged-in sockets (live Teams cards/dashboard) and admin `TeamEditor`; public read-only `/api/ws/live` score socket; every `score:update` has a `live` summary (battingTeam, bowlingTeam, runs, wickets, overs "x.y", totalOvers, batters w/ onStrike, bowler, thisOver with "•" dots); README has a requirements checklist + reviewer guide.
  **Admin bootstrap (2026-11-12)** — `seed/seedAdmin.ts` `ensureAdminFromEnv()` on startup and in `npm run seed`: `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` → creates admin (bcrypt) or promotes existing user (password untouched); refuses the example password / invalid values; top-bar ADMIN badge. User's own account (karthikcv1122@…) is still role user; their .env has no ADMIN_* yet.
  **Spec audit fixes (2026-11-12)** — `username` (unique partial index, login by username or email via `identifier`), `ADMIN_USERNAME`; `/api/admin/teams` (GET, PATCH `:id`) + `/api/subscriptions` (POST/PATCH/DELETE `:teamId`) reusing existing controllers; `getTeamByRef` (id or short); Notification `type` + `message` (+ `value` in JSON); login brute-force limiter (`middleware/loginLimiter.ts`, 429); `/health.changeStream`; client `/admin/login` (LoginPage variant) + `/admin/dashboard` (team table + TeamEditor), dashboard with stats/live mini scorecard/followed (FieldPicker)/discover via shared `useTeams` + `useLiveMatch` hooks. Tests: `server/tests` (Vitest + Supertest + mongodb-memory-server-core replica set), `npm test` (46 passing); ESLint in both packages (`npm run lint`). Git initialised, baseline staged, nothing committed. Waiting for user's go-ahead for anything further.
- Server code lives under `server/src/` (config/, models/, ... app.ts, server.ts). Client calls API via `/api` (Vite proxy in dev, nginx proxy in Docker → `server:5000`).
- Ports: client container 3000, server 5000, Vite dev 5173. Single root `.env` is used by compose and local dev.

## Goal
Full-stack MERN app where users can:
- Register/login using JWT.
- Follow/unfollow IPL teams.
- Receive real-time notifications when a followed team's MongoDB data changes.
- View saved notifications after logging back in.
- Mark notifications as read.
- Subscribe to specific team fields (captain, points, wins, etc.).
- View a live IPL match scorecard via WebSocket.

Admins can update team data. Direct MongoDB changes (scripts/mongosh) must also trigger notifications via **MongoDB Change Streams**.

## Technology
- **Frontend:** React, TypeScript, Vite, Axios, WebSocket
- **Backend:** Node.js, Express, TypeScript, MongoDB, Mongoose, JWT, bcrypt, WebSocket, MongoDB Change Streams
- **Database:** MongoDB Atlas (online) via `MONGODB_URI`. **Do NOT create a MongoDB Docker container.**
- **Docker:** Dockerize frontend and backend; Docker Compose for frontend + backend only.

## Project structure
```text
ipl-team-updates/
├── client/
├── server/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

Backend (`server/`) organized into:
```text
config/  models/  controllers/  services/  routes/  middleware/
websocket/  change-stream/  simulator/  seed/  types/
app.ts  server.ts
```

Models: `User`, `Team`, `Subscription`, `Notification`

## Architecture
```text
React → REST API → Node + Express → MongoDB Atlas

MongoDB Team Change → Change Stream → Notification Service
  → Save Notification → WebSocket → React Dashboard
```
Live scores:
```text
Match Simulator → MongoDB / Score Service → WebSocket → React Live Scorecard
```

## Team data
Seed the 10 IPL teams with: `name, short, captain, headCoach, homeGround, titles, wins, losses, points`

## Notification behavior
- One MongoDB update changing multiple fields → **ONE grouped notification** listing all changed fields. Example:
  ```text
  RCB updated
  Captain → New Captain
  Wins → 10
  Points → 20
  ```
  Never create separate notifications per field.
- Field-level subscriptions: user follows RCB and selects `captain, points`:
  - wins changes → no notification
  - captain changes → notification
  - captain + wins + points change → notify only for captain + points

## Phase 1 (only when user says start)
1. Create the complete project structure.
2. Initialize React/Vite/TypeScript frontend.
3. Initialize Node/Express/TypeScript backend.
4. Add MongoDB Atlas connection using `MONGODB_URI`.
5. Add Dockerfiles for frontend and backend.
6. Add `docker-compose.yml`.
7. Add `.env.example`.
8. Add a `/health` API endpoint.
9. Verify frontend and backend run successfully with Docker.
10. Do NOT implement authentication, notifications, WebSocket, or dashboard yet.

After Phase 1, briefly explain:
- Files created
- What each major folder does
- How MongoDB Atlas connects
- How Docker is used
- Commands to run the project

Then stop and wait for the user before Phase 2.
