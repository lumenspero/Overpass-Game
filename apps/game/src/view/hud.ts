import {
  summaryOf,
  tuning,
  type GameSummary,
  type SimState,
  ticksLeftInWeek,
} from '@overpass-game/sim';

/**
 * Text for the HUD and the end screen. Pure: the scene shows these strings, and the
 * rules behind them live in the sim.
 */

/** Colour of an overflow countdown ring. */
export const OVERFLOW_RING_COLOR = 0xe5484d;

/** The line across the top of the screen: week, time left in it, trips so far. */
export function hudLine(state: SimState, paused = false): string {
  const summary = summaryOf(state);
  const secondsLeft = Math.ceil(
    ticksLeftInWeek(state.tick) / tuning.TICKS_PER_SECOND,
  );
  const line = `Week ${summary.week} · ${secondsLeft}s left · Trips ${summary.trips}`;
  return paused && !state.over ? `${line} · Paused` : line;
}

/** The lines of the end screen, or none while the game is still on. */
export function endLines(summary: GameSummary): string[] {
  if (!summary.over) return [];
  return [
    'Game over',
    `Week ${summary.week}`,
    `Trips completed: ${summary.trips}`,
  ];
}
