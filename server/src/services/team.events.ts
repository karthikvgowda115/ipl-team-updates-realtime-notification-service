import { EventEmitter } from 'events';

export interface TeamSnapshot {
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
  changed: string[]; // fields changed by this update
}

/** Raised by the Change Stream for every team change, so open pages can show the new values live. */
class TeamEvents extends EventEmitter {
  emitUpdated(team: TeamSnapshot): void {
    this.emit('updated', team);
  }
  onUpdated(listener: (team: TeamSnapshot) => void): () => void {
    this.on('updated', listener);
    return () => this.off('updated', listener);
  }
}

export const teamEvents = new TeamEvents();
