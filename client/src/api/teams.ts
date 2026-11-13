import { api } from './client';

/** Team fields you can be notified about (same order/labels as the server's TEAM_FIELDS). */
export const TEAM_FIELDS = ['name', 'captain', 'headCoach', 'homeGround', 'titles', 'wins', 'losses', 'points'] as const;
export type TeamField = (typeof TEAM_FIELDS)[number];

export const FIELD_LABELS: Record<TeamField, string> = {
  name: 'Name',
  captain: 'Captain',
  headCoach: 'Head coach',
  homeGround: 'Home ground',
  titles: 'Titles',
  wins: 'Wins',
  losses: 'Losses',
  points: 'Points',
};

/** "All updates" or "Captain, Points". */
export function describeFields(fields: readonly string[] | null | undefined): string {
  if (!fields || fields.length === 0) return 'Nothing';
  if (fields.length >= TEAM_FIELDS.length) return 'All updates';
  return fields.map((f) => FIELD_LABELS[f as TeamField] ?? f).join(', ');
}

export interface Team {
  id: string;
  name: string;
  short: string;
  captain: string;
  headCoach: string;
  homeGround: string;
  titles: number;
  wins: number;
  losses: number;
  points: number;
  followers: number;
  following: boolean;
  fields: TeamField[] | null; // what you're notified about; null when not following
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  team: Omit<Team, 'followers' | 'following' | 'fields'>;
  fields: TeamField[];
  createdAt: string;
}

export async function fetchTeams(): Promise<Team[]> {
  const { data } = await api.get<{ teams: Team[] }>('/teams');
  return data.teams;
}

export async function followTeam(short: string): Promise<{ fields: TeamField[] }> {
  const { data } = await api.post<{ subscription: { fields: TeamField[] } }>(`/teams/${encodeURIComponent(short)}/follow`);
  return { fields: data.subscription.fields };
}

export async function unfollowTeam(short: string): Promise<void> {
  await api.delete(`/teams/${encodeURIComponent(short)}/follow`);
}

/** Choose which fields of a followed team trigger notifications. */
export async function updateFollowFields(short: string, fields: TeamField[]): Promise<TeamField[]> {
  const { data } = await api.patch<{ subscription: { fields: TeamField[] } }>(
    `/teams/${encodeURIComponent(short)}/follow`,
    { fields },
  );
  return data.subscription.fields;
}

export type TeamPatch = Partial<Pick<Team, 'name' | 'captain' | 'headCoach' | 'homeGround' | 'titles' | 'wins' | 'losses' | 'points'>>;

/** Admin only: all teams (same shape as fetchTeams). */
export async function fetchAdminTeams(): Promise<Team[]> {
  const { data } = await api.get<{ teams: Team[] }>('/admin/teams');
  return data.teams;
}

/**
 * Admin only: update several team fields in ONE request (`teamId` = id or short code).
 * Followers are notified through the server's Change Stream.
 */
export async function adminUpdateTeam(teamId: string, patch: TeamPatch): Promise<{ changed: string[]; message: string }> {
  const { data } = await api.patch<{ changed: string[]; message: string }>(`/admin/teams/${encodeURIComponent(teamId)}`, patch);
  return data;
}

/** Shape of a `team:update` WebSocket message's team. */
export type TeamSnapshot = Omit<Team, 'followers' | 'following' | 'fields' | 'createdAt' | 'updatedAt'> & {
  changed: string[];
};

export async function fetchSubscriptions(): Promise<Subscription[]> {
  const { data } = await api.get<{ subscriptions: Subscription[] }>('/subscriptions');
  return data.subscriptions;
}
