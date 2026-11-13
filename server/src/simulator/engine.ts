import type { Types } from 'mongoose';
import type { BatterCard, BowlerCard, Commentary, IMatch, Innings, MatchTeam } from '../models/Match';

/**
 * Pure cricket-simulation logic (no database, no timers), so it is easy to test:
 * createMatch() → bowlBall() repeatedly → startSecondInnings() → bowlBall() ... → completed.
 * Everything mutates a plain MatchState object that is saved to MongoDB as-is.
 */

export type MatchState = Omit<IMatch, 'createdAt' | 'updatedAt'> & { _id: Types.ObjectId };
export type Rng = () => number;

export interface TeamInput {
  team: Types.ObjectId;
  short: string;
  name: string;
  homeGround: string;
  squad: string[];
}

const COMMENTARY_LIMIT = 30;
const BOWLING_OPTIONS = 6; // the last six of the XI bowl

export const overLabel = (legalBalls: number): string => `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function weighted<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + Math.max(w, 0), 0);
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= Math.max(w, 0);
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function newInnings(batting: MatchTeam, bowling: MatchTeam): Innings {
  const batters: BatterCard[] = batting.squad.map((name, i) => ({
    name,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    status: i < 2 ? 'batting' : 'yet',
  }));
  return {
    batting: batting.short,
    bowling: bowling.short,
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: 0,
    batters,
    bowlers: [],
    striker: 0,
    nonStriker: 1,
    nextBatter: 2,
    currentBowler: -1,
    needBowler: true,
    lastOverBowler: null,
    thisOver: [],
    fallOfWickets: [],
  };
}

function addCommentary(state: MatchState, entry: Commentary): void {
  state.commentary.unshift(entry);
  if (state.commentary.length > COMMENTARY_LIMIT) state.commentary.length = COMMENTARY_LIMIT;
}

const teamByShort = (state: MatchState, short: string): MatchTeam => state.teams.find((t) => t.short === short)!;

export function createMatch(home: TeamInput, away: TeamInput, overs: number, id: Types.ObjectId, rng: Rng = Math.random): MatchState {
  const teams: [MatchTeam, MatchTeam] = [
    { team: home.team, short: home.short, name: home.name, squad: home.squad },
    { team: away.team, short: away.short, name: away.name, squad: away.squad },
  ];
  const tossWinner = rng() < 0.5 ? 0 : 1;
  const electsBat = rng() < 0.4; // T20 captains usually prefer to chase
  const battingFirst = electsBat ? tossWinner : 1 - tossWinner;

  const state: MatchState = {
    _id: id,
    title: `${home.short} vs ${away.short}`,
    venue: home.homeGround,
    overs,
    teams,
    toss: `${teams[tossWinner].name} won the toss and chose to ${electsBat ? 'bat' : 'bowl'}`,
    status: 'live',
    innings: [newInnings(teams[battingFirst], teams[1 - battingFirst])],
    currentInnings: 0,
    target: null,
    result: null,
    winner: null,
    commentary: [],
    ballsBowled: 0,
    startedAt: new Date(),
    completedAt: null,
  };
  addCommentary(state, { over: '0.0', text: state.toss, kind: 'info' });
  return state;
}

/** Chooses the next over's bowler: max overs/5 overs each, never two overs in a row. */
function chooseBowler(state: MatchState, inn: Innings, rng: Rng): number {
  const options = teamByShort(state, inn.bowling).squad.slice(-BOWLING_OPTIONS);
  const maxBalls = Math.max(1, Math.ceil(state.overs / 5)) * 6;
  const ballsOf = (name: string) => inn.bowlers.find((b) => b.name === name)?.balls ?? 0;

  let eligible = options.filter((n) => n !== inn.lastOverBowler && ballsOf(n) < maxBalls);
  if (eligible.length === 0) eligible = options.filter((n) => n !== inn.lastOverBowler);
  const name = pick(rng, eligible);

  let idx = inn.bowlers.findIndex((b) => b.name === name);
  if (idx === -1) {
    inn.bowlers.push({ name, balls: 0, runs: 0, wickets: 0 });
    idx = inn.bowlers.length - 1;
  }
  return idx;
}

type Outcome = '0' | '1' | '2' | '3' | '4' | '6' | 'W' | 'wd' | 'nb';

function outcomeWeights(state: MatchState, inn: Innings): Record<Outcome, number> {
  const over = Math.floor(inn.balls / 6);
  const death = state.overs >= 10 && over >= state.overs - 4;
  const powerplay = over < Math.min(6, Math.floor(state.overs * 0.3) || 1);
  return {
    '0': death ? 27 : 34,
    '1': 36,
    '2': 8,
    '3': 1,
    '4': death ? 13 : powerplay ? 12 : 10,
    '6': death ? 7 : 4,
    W: death ? 6.5 : 4.5,
    wd: 3,
    nb: 0.7,
  };
}

function swapStrike(inn: Innings): void {
  [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
}

function isInningsOver(state: MatchState, inn: Innings): boolean {
  if (inn.wickets >= 10 || inn.balls >= state.overs * 6) return true;
  return state.currentInnings === 1 && state.target !== null && inn.runs >= state.target;
}

function finishMatch(state: MatchState): void {
  const chase = state.innings[1];
  const target = state.target!;
  const chasing = teamByShort(state, chase.batting);
  const defending = teamByShort(state, chase.bowling);
  if (chase.runs >= target) {
    const wkts = 10 - chase.wickets;
    const left = state.overs * 6 - chase.balls;
    state.winner = chasing.short;
    state.result = `${chasing.name} won by ${wkts} wicket${wkts === 1 ? '' : 's'}${left > 0 ? ` (${left} ball${left === 1 ? '' : 's'} left)` : ''}`;
  } else if (chase.runs === target - 1) {
    state.winner = null;
    state.result = 'Match tied';
  } else {
    const margin = target - 1 - chase.runs;
    state.winner = defending.short;
    state.result = `${defending.name} won by ${margin} run${margin === 1 ? '' : 's'}`;
  }
  state.status = 'completed';
  state.completedAt = new Date();
  addCommentary(state, { over: overLabel(chase.balls), text: state.result, kind: 'info' });
}

/** Bowls one delivery of the current innings. No-op unless the match is live. */
export function bowlBall(state: MatchState, rng: Rng = Math.random): void {
  if (state.status !== 'live') return;
  const inn = state.innings[state.currentInnings];

  if (inn.needBowler) {
    inn.currentBowler = chooseBowler(state, inn, rng);
    inn.needBowler = false;
    inn.thisOver = [];
  }

  const bowler: BowlerCard = inn.bowlers[inn.currentBowler];
  const batter: BatterCard = inn.batters[inn.striker];
  const label = `${Math.floor(inn.balls / 6)}.${(inn.balls % 6) + 1}`;
  const who = `${bowler.name} to ${batter.name}`;
  const outcome = weighted(rng, outcomeWeights(state, inn));
  state.ballsBowled += 1;

  if (outcome === 'wd') {
    inn.runs += 1;
    inn.extras += 1;
    bowler.runs += 1;
    inn.thisOver.push('wd');
    addCommentary(state, { over: label, text: `${who}, wide`, kind: 'extra' });
  } else if (outcome === 'nb') {
    const offBat = Number(weighted(rng, { '0': 60, '1': 25, '4': 10, '6': 5 }));
    inn.runs += 1 + offBat;
    inn.extras += 1;
    bowler.runs += 1 + offBat;
    batter.runs += offBat;
    batter.balls += 1;
    if (offBat === 4) batter.fours += 1;
    if (offBat === 6) batter.sixes += 1;
    if (offBat % 2 === 1) swapStrike(inn);
    inn.thisOver.push(offBat ? `nb+${offBat}` : 'nb');
    addCommentary(state, { over: label, text: `${who}, no ball${offBat ? ` + ${offBat}` : ''}`, kind: 'extra' });
  } else if (outcome === 'W') {
    const how = weighted(rng, { caught: 58, bowled: 20, lbw: 14, runout: 8 });
    const fielder = pick(rng, teamByShort(state, inn.bowling).squad); // may be the bowler: c & b
    const dismissal =
      how === 'caught'
        ? fielder === bowler.name
          ? `c & b ${bowler.name}`
          : `c ${fielder} b ${bowler.name}`
        : how === 'bowled'
          ? `b ${bowler.name}`
          : how === 'lbw'
            ? `lbw b ${bowler.name}`
            : `run out (${fielder})`;

    batter.balls += 1;
    batter.status = 'out';
    batter.dismissal = dismissal;
    bowler.balls += 1;
    if (how !== 'runout') bowler.wickets += 1;
    inn.balls += 1;
    inn.wickets += 1;
    inn.fallOfWickets.push({ wicket: inn.wickets, runs: inn.runs, over: overLabel(inn.balls), batter: batter.name });
    inn.thisOver.push('W');
    addCommentary(state, {
      over: label,
      text: `${who}, OUT! ${batter.name} ${dismissal} ${batter.runs} (${batter.balls})`,
      kind: 'wicket',
    });
    if (inn.wickets < 10 && inn.nextBatter < inn.batters.length) {
      inn.batters[inn.nextBatter].status = 'batting';
      inn.striker = inn.nextBatter;
      inn.nextBatter += 1;
    }
  } else {
    const runs = Number(outcome);
    inn.runs += runs;
    inn.balls += 1;
    batter.runs += runs;
    batter.balls += 1;
    bowler.runs += runs;
    bowler.balls += 1;
    if (runs === 4) batter.fours += 1;
    if (runs === 6) batter.sixes += 1;
    if (runs % 2 === 1) swapStrike(inn);
    inn.thisOver.push(runs === 0 ? '•' : outcome); // dot ball shown as •
    const text = runs === 0 ? 'no run' : runs === 4 ? 'FOUR!' : runs === 6 ? 'SIX!' : `${runs} run${runs > 1 ? 's' : ''}`;
    addCommentary(state, {
      over: label,
      text: `${who}, ${text}`,
      kind: runs === 0 ? 'dot' : runs === 4 ? 'four' : runs === 6 ? 'six' : 'run',
    });
  }

  // End of over (6 legal balls): batters cross, a different bowler bowls next.
  const legal = outcome !== 'wd' && outcome !== 'nb';
  if (legal && inn.balls % 6 === 0 && inn.balls > 0) {
    swapStrike(inn);
    inn.lastOverBowler = bowler.name;
    inn.needBowler = true;
  }

  if (isInningsOver(state, inn)) {
    if (state.currentInnings === 0) {
      state.status = 'innings_break';
      state.target = inn.runs + 1;
      const chasing = teamByShort(state, inn.bowling);
      addCommentary(state, {
        over: overLabel(inn.balls),
        text: `Innings break: ${inn.batting} ${inn.runs}/${inn.wickets} (${overLabel(inn.balls)} ov). ${chasing.short} need ${state.target} to win.`,
        kind: 'info',
      });
    } else {
      finishMatch(state);
    }
  }
}

export function startSecondInnings(state: MatchState): void {
  if (state.status !== 'innings_break') return;
  const first = state.innings[0];
  state.innings.push(newInnings(teamByShort(state, first.bowling), teamByShort(state, first.batting)));
  state.currentInnings = 1;
  state.status = 'live';
  addCommentary(state, { over: '0.0', text: `${first.bowling} begin the chase of ${state.target}`, kind: 'info' });
}
