import { Schema, model, type HydratedDocument } from 'mongoose';

export interface ITeam {
  name: string;
  short: string; // e.g. "RCB" — unique, used in URLs
  captain: string;
  headCoach: string;
  homeGround: string;
  titles: number;
  wins: number;
  losses: number;
  points: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TeamDocument = HydratedDocument<ITeam>;

/**
 * Team fields a user can be notified about (and later subscribe to individually).
 * `short` is the team's identifier, so it is not tracked.
 */
export const TEAM_FIELDS = [
  'name',
  'captain',
  'headCoach',
  'homeGround',
  'titles',
  'wins',
  'losses',
  'points',
] as const;
export type TeamField = (typeof TEAM_FIELDS)[number];

/** Human labels, used in notifications and the field-selection UI. */
export const TEAM_FIELD_LABELS: Record<TeamField, string> = {
  name: 'Name',
  captain: 'Captain',
  headCoach: 'Head coach',
  homeGround: 'Home ground',
  titles: 'Titles',
  wins: 'Wins',
  losses: 'Losses',
  points: 'Points',
};

export function isTeamField(v: unknown): v is TeamField {
  return typeof v === 'string' && (TEAM_FIELDS as readonly string[]).includes(v);
}

const count = { type: Number, required: true, min: 0, default: 0 };

const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    short: { type: String, required: true, trim: true, uppercase: true, unique: true, maxlength: 5 },
    captain: { type: String, required: true, trim: true },
    headCoach: { type: String, required: true, trim: true },
    homeGround: { type: String, required: true, trim: true },
    titles: count,
    wins: count,
    losses: count,
    points: count,
  },
  {
    timestamps: true,
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

export const Team = model<ITeam>('Team', teamSchema);
