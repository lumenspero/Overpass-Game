import type { GameSummary } from '@overpass-game/sim';

/**
 * Text for the end screen. Pure: the scene shows these strings, and the rules behind them live in
 * the sim. The top bar's day, clock and trips are in view/calendar.ts and ui/top-bar.ts.
 */

/** Colour of an overflow countdown ring. */
export const OVERFLOW_RING_COLOR = 0xe5484d;

/** The lines of the end screen, or none while the game is still on. */
export function endLines(summary: GameSummary): string[] {
  if (!summary.over) return [];
  return [
    'Game over',
    `Week ${summary.week}`,
    `Trips completed: ${summary.trips}`,
  ];
}
