import { tuning } from './config.ts';
import type { GameOver, SimState } from './sim.ts';

/**
 * Score and clock (spec: Clock and time, Score). The score is trips completed: a car that
 * reaches its destination and serves a pin. The clock counts weeks from week 1. Both are
 * read from the sim's own state, so they can't drift from it.
 */

/** The week a tick falls in. Tick 0 is in week 1. */
export function weekOf(tick: number): number {
  return Math.floor(tick / tuning.WEEK_TICKS) + 1;
}

/** Ticks left in the week the sim is in now. */
export function ticksLeftInWeek(tick: number): number {
  return tuning.WEEK_TICKS - (tick % tuning.WEEK_TICKS);
}

export interface GameSummary {
  /** The week the game is in, or ended in. */
  week: number;
  /** Trips completed. */
  trips: number;
  /** Set once the game has ended. */
  over: GameOver | null;
}

export function summaryOf(state: SimState): GameSummary {
  // A finished game reports the week it ended in, not whatever tick the sim stopped on.
  return {
    week: weekOf(state.over ? state.over.tick : state.tick),
    trips: state.tripsCompleted,
    over: state.over,
  };
}
