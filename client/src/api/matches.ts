import { api } from './client';

export type MatchStatus = 'live' | 'innings_break' | 'completed' | 'abandoned';

export interface BatterCard {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  status: 'yet' | 'batting' | 'out';
  dismissal?: string;
}

export interface BowlerCard {
  name: string;
  balls: number;
  runs: number;
  wickets: number;
}

export interface Innings {
  batting: string;
  bowling: string;
  runs: number;
  wickets: number;
  balls: number;
  extras: number;
  batters: BatterCard[];
  bowlers: BowlerCard[];
  striker: number;
  nonStriker: number;
  currentBowler: number;
  thisOver: string[];
  fallOfWickets: { wicket: number; runs: number; over: string; batter: string }[];
}

export interface Commentary {
  over: string;
  text: string;
  kind: 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'extra' | 'info';
}

export interface Match {
  id: string;
  title: string;
  venue: string;
  overs: number;
  teams: { id: string; short: string; name: string; squad: string[] }[];
  toss: string;
  status: MatchStatus;
  innings: Innings[];
  currentInnings: number;
  target: number | null;
  result: string | null;
  winner: string | null;
  commentary: Commentary[];
  ballsBowled: number;
  startedAt: string;
  completedAt: string | null;
}

/** Compact score summary sent with every score message (`live` in score:update). */
export interface LiveScore {
  matchId: string;
  title: string;
  status: MatchStatus;
  innings: number;
  battingTeam: { short: string; name: string };
  bowlingTeam: { short: string; name: string };
  runs: number;
  wickets: number;
  overs: string; // "15.3"
  totalOvers: number;
  batters: { name: string; runs: number; balls: number; fours: number; sixes: number; onStrike: boolean }[];
  bowler: { name: string; overs: string; runs: number; wickets: number } | null;
  thisOver: string[]; // ["1","4","W","•"]
  target: number | null;
  required: { runs: number; balls: number } | null;
  lastBall: string | null;
  result: string | null;
}

export interface ScorePayload {
  live: LiveScore | null;
  match: Match | null;
}

export async function fetchCurrentScore(): Promise<ScorePayload> {
  const { data } = await api.get<ScorePayload>('/matches/current');
  return data;
}

/** Admin only: start a new simulated match now. */
export async function startMatch(teams?: [string, string], overs?: number): Promise<Match> {
  const { data } = await api.post<{ match: Match }>('/matches/start', { teams, overs });
  return data.match;
}

// ---------- cricket helpers ----------

export const oversText = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

export function runRate(runs: number, balls: number): string {
  return balls === 0 ? '0.00' : ((runs * 6) / balls).toFixed(2);
}

export const strikeRate = (runs: number, balls: number) => (balls === 0 ? '0.0' : ((runs * 100) / balls).toFixed(1));
