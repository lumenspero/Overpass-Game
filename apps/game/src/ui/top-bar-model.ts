import type { Speed } from '@overpass-game/sim';

/**
 * What the clock menu's three buttons mean. The menu offers play at normal speed, pause, and a
 * fast-forward at 2×. Pure, so the mapping is tested without a page.
 */

export type PlayChoice = 'play' | 'pause' | 'fast';

/** The speed the fast-forward button sets. The clock menu offers only this and normal speed. */
export const FAST_FORWARD_SPEED: Speed = 2;

/** Which button is lit for the clock's state. A speed the menu doesn't offer counts as fast-forward. */
export function choiceOf(paused: boolean, speed: Speed): PlayChoice {
  if (paused) return 'pause';
  return speed === 1 ? 'play' : 'fast';
}

/** The clock state a button sets. Pause keeps the speed, so resuming returns to it. */
export function clockFor(
  choice: PlayChoice,
  speed: Speed,
): { paused: boolean; speed: Speed } {
  if (choice === 'pause') return { paused: true, speed };
  if (choice === 'play') return { paused: false, speed: 1 };
  return { paused: false, speed: FAST_FORWARD_SPEED };
}
