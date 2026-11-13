import { Types } from 'mongoose';
import { env } from '../config/env';
import { Match } from '../models/Match';
import { Team } from '../models/Team';
import { scoreEvents } from '../services/score.events';
import { HttpError } from '../types/errors';
import { bowlBall, createMatch, startSecondInnings, type MatchState, type TeamInput } from './engine';
import { squadFor } from './squads';

/**
 * Runs simulated matches forever:
 *   new match → ball every SIM_BALL_INTERVAL_MS → innings break → chase → result
 *   → pause SIM_MATCH_BREAK_MS → next match.
 * After every ball the full state is saved to MongoDB (so a restart resumes the match)
 * and published on `scoreEvents` (the WebSocket layer broadcasts it to the "score" channel).
 *
 * Assumes ONE server instance. With several instances, run the simulator in only one
 * of them (SIMULATOR_ENABLED=false elsewhere).
 */

const cfg = env.simulator;
let current: MatchState | null = null;
let timer: NodeJS.Timeout | null = null;
let running = false;
let generation = 0; // bumps when a match is replaced, so stale timers do nothing

/** The shape sent to browsers (REST and WebSocket). */
export function toView(state: MatchState) {
  const { _id, ...rest } = state;
  return { id: String(_id), ...rest, teams: rest.teams.map(({ team, ...t }) => ({ ...t, id: String(team) })) };
}
export type MatchView = ReturnType<typeof toView>;

const oversText = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

/**
 * Compact live-score summary included in every score message:
 * batting/bowling team, runs/wickets, overs "15.3" of totalOvers, the batters at the
 * crease (with who's on strike), the current bowler's figures and the balls of this over.
 */
export function toLiveSummary(state: MatchState) {
  const inn = state.innings[state.currentInnings];
  const team = (short: string) => {
    const t = state.teams.find((x) => x.short === short)!;
    return { short: t.short, name: t.name };
  };
  const bowler = inn.bowlers[inn.currentBowler];
  const ballsLeft = state.overs * 6 - inn.balls;
  const chasing = state.currentInnings === 1 && state.target !== null;
  return {
    matchId: String(state._id),
    title: state.title,
    status: state.status,
    innings: state.currentInnings + 1,
    battingTeam: team(inn.batting),
    bowlingTeam: team(inn.bowling),
    runs: inn.runs,
    wickets: inn.wickets,
    overs: oversText(inn.balls),
    totalOvers: state.overs,
    batters: [inn.striker, inn.nonStriker]
      .filter((i) => inn.batters[i]?.status === 'batting')
      .map((i) => {
        const b = inn.batters[i];
        return { name: b.name, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, onStrike: i === inn.striker };
      }),
    bowler: bowler ? { name: bowler.name, overs: oversText(bowler.balls), runs: bowler.runs, wickets: bowler.wickets } : null,
    thisOver: [...inn.thisOver],
    target: state.target,
    required: chasing && state.status === 'live' ? { runs: Math.max(state.target! - inn.runs, 0), balls: ballsLeft } : null,
    lastBall: state.commentary[0]?.text ?? null,
    result: state.result,
  };
}

/** What every score message / REST response carries. */
export function toScorePayload(state: MatchState | null) {
  return state ? { live: toLiveSummary(state), match: toView(state) } : { live: null, match: null };
}

function schedule(ms: number, fn: () => Promise<void>): void {
  if (!running) return;
  if (timer) clearTimeout(timer);
  const gen = generation;
  timer = setTimeout(() => {
    timer = null;
    if (gen !== generation || !running) return;
    fn().catch((err: Error) => {
      console.error('[simulator] step failed:', err.message);
      schedule(cfg.ballIntervalMs, fn); // keep going (e.g. a brief Atlas hiccup)
    });
  }, ms);
}

async function persist(state: MatchState): Promise<void> {
  try {
    await Match.replaceOne({ _id: state._id }, state, { upsert: true });
  } catch (err) {
    // State stays in memory; the next ball's write saves everything again.
    console.error('[simulator] could not save match state:', (err as Error).message);
  }
}

function publish(state: MatchState): void {
  scoreEvents.emitUpdate(toScorePayload(state));
}

/** Win = 2 points, tie = 1 each. One update per team → one grouped notification per follower. */
async function updateStandings(state: MatchState): Promise<void> {
  if (!cfg.updateStandings) return;
  const [a, b] = state.teams;
  const ops =
    state.winner === null
      ? [
          { id: a.team, inc: { points: 1 } },
          { id: b.team, inc: { points: 1 } },
        ]
      : [
          { id: state.winner === a.short ? a.team : b.team, inc: { wins: 1, points: 2 } },
          { id: state.winner === a.short ? b.team : a.team, inc: { losses: 1 } },
        ];
  for (const op of ops) await Team.updateOne({ _id: op.id }, { $inc: op.inc });
  console.log(`[simulator] standings updated after ${state.title}`);
}

async function step(): Promise<void> {
  const state = current;
  if (!state) return;

  if (state.status === 'innings_break') {
    startSecondInnings(state);
  } else if (state.status === 'live') {
    bowlBall(state);
  }
  await persist(state);
  publish(state);

  if (state.status === 'live') {
    schedule(cfg.ballIntervalMs, step);
  } else if (state.status === 'innings_break') {
    schedule(cfg.inningsBreakMs, step);
  } else if (state.status === 'completed') {
    console.log(`[simulator] ${state.title}: ${state.result}`);
    await updateStandings(state).catch((err: Error) => console.error('[simulator] standings update failed:', err.message));
    // Auto-loop only when the simulator is enabled (an admin can still start one-off matches).
    if (cfg.enabled) schedule(cfg.matchBreakMs, () => startNewMatch().then(() => undefined));
  }
}

async function pickTeams(shorts?: [string, string]): Promise<[TeamInput, TeamInput]> {
  const teams = await Team.find().select('name short captain homeGround').lean();
  if (teams.length < 2) throw new HttpError(409, 'At least two teams are needed to start a match');

  let chosen;
  if (shorts) {
    const [a, b] = shorts.map((s) => s.trim().toUpperCase());
    if (a === b) throw new HttpError(400, 'Pick two different teams');
    chosen = [a, b].map((s) => {
      const t = teams.find((x) => x.short === s);
      if (!t) throw new HttpError(404, `Team "${s}" not found`);
      return t;
    });
  } else {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    chosen = shuffled.slice(0, 2);
  }
  return chosen.map((t) => ({
    team: t._id,
    short: t.short,
    name: t.name,
    homeGround: t.homeGround,
    squad: squadFor(t.short, t.captain),
  })) as [TeamInput, TeamInput];
}

/**
 * Starts a new match now (any running match is marked abandoned).
 * Used by the loop and by the admin "start match" endpoint.
 */
export async function startNewMatch(shorts?: [string, string], overs = cfg.overs): Promise<MatchView> {
  const [home, away] = await pickTeams(shorts);
  generation += 1;
  if (timer) clearTimeout(timer);
  timer = null;

  if (current && current.status !== 'completed') {
    current.status = 'abandoned';
    current.result = 'Match abandoned';
    current.completedAt = new Date();
    await persist(current);
  }

  const state = createMatch(home, away, overs, new Types.ObjectId());
  current = state;
  await persist(state);
  publish(state);
  console.log(`[simulator] New match: ${state.title} at ${state.venue} (${overs} overs). ${state.toss}`);
  running = true;
  schedule(cfg.ballIntervalMs, step);
  return toView(state);
}

/** Current match (live, break, or the last result) as { live, match }. Falls back to the latest saved match. */
export async function getCurrentScore() {
  if (current) return toScorePayload(current);
  const last = await Match.findOne({ status: { $ne: 'abandoned' } }).sort({ startedAt: -1 }).lean();
  return toScorePayload(last ? (last as unknown as MatchState) : null);
}

/** Called once after the DB connects. Resumes an unfinished match or starts a new one. */
export async function startSimulator(): Promise<void> {
  if (!cfg.enabled) {
    console.log('[simulator] Disabled (SIMULATOR_ENABLED=false)');
    return;
  }
  if (running) return;
  running = true;

  const unfinished = await Match.findOne({ status: { $in: ['live', 'innings_break'] } }).sort({ startedAt: -1 }).lean();
  if (unfinished) {
    current = unfinished as unknown as MatchState;
    console.log(`[simulator] Resuming ${current.title} (${current.status})`);
    publish(current);
    schedule(cfg.ballIntervalMs, step);
  } else {
    schedule(1000, () => startNewMatch().then(() => undefined));
  }
}

export function stopSimulator(): void {
  running = false;
  generation += 1;
  if (timer) clearTimeout(timer);
  timer = null;
}
