import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export type MatchStatus = 'live' | 'innings_break' | 'completed' | 'abandoned';

export interface BatterCard {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  status: 'yet' | 'batting' | 'out';
  dismissal?: string; // e.g. "c Rahane b Narine"
}

export interface BowlerCard {
  name: string;
  balls: number; // legal deliveries
  runs: number;
  wickets: number;
}

export interface FallOfWicket {
  wicket: number;
  runs: number;
  over: string; // "12.3"
  batter: string;
}

export interface Innings {
  batting: string; // team short
  bowling: string;
  runs: number;
  wickets: number;
  balls: number; // legal deliveries
  extras: number;
  batters: BatterCard[]; // full XI in batting order
  bowlers: BowlerCard[]; // only those who have bowled
  striker: number; // index into batters
  nonStriker: number;
  nextBatter: number;
  currentBowler: number; // index into bowlers, -1 before the first ball
  needBowler: boolean; // true at the start of each over
  lastOverBowler: string | null; // a bowler can't bowl two overs in a row
  thisOver: string[]; // ball symbols of the current over: "•" (dot) "1" "4" "W" "wd" "nb+4" ...
  fallOfWickets: FallOfWicket[];
}

export interface Commentary {
  over: string;
  text: string;
  kind: 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'extra' | 'info';
}

export interface MatchTeam {
  team: Types.ObjectId;
  short: string;
  name: string;
  squad: string[]; // batting order; last 6 are the bowling options
}

/**
 * A simulated match. The whole state is stored after every ball, so a server restart
 * resumes the match exactly where it was.
 */
export interface IMatch {
  title: string; // "RCB vs CSK"
  venue: string;
  overs: number; // overs per innings
  teams: [MatchTeam, MatchTeam];
  toss: string;
  status: MatchStatus;
  innings: Innings[];
  currentInnings: number; // 0 or 1
  target: number | null; // runs needed by the chasing side
  result: string | null;
  winner: string | null; // team short, null for tie/no result
  commentary: Commentary[]; // newest first, capped
  ballsBowled: number; // total deliveries (incl. extras) — a version counter for clients
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MatchDocument = HydratedDocument<IMatch>;

const matchSchema = new Schema<IMatch>(
  {
    title: { type: String, required: true },
    venue: { type: String, required: true },
    overs: { type: Number, required: true, min: 1, max: 50 },
    // Nested match state is stored as-is (it's written by the simulator, not by users).
    teams: { type: Schema.Types.Mixed, required: true },
    toss: { type: String, required: true },
    status: { type: String, enum: ['live', 'innings_break', 'completed', 'abandoned'], required: true },
    innings: { type: Schema.Types.Mixed, default: () => [] },
    currentInnings: { type: Number, default: 0 },
    target: { type: Number, default: null },
    result: { type: String, default: null },
    winner: { type: String, default: null },
    commentary: { type: Schema.Types.Mixed, default: () => [] },
    ballsBowled: { type: Number, default: 0 },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    minimize: false,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

matchSchema.index({ status: 1, startedAt: -1 });
matchSchema.index({ startedAt: -1 });

export const Match = model<IMatch>('Match', matchSchema);
