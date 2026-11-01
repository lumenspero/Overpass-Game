import { weekOf } from './score.ts';
import type { SimState } from './sim.ts';

/**
 * Per-map rules (spec: Destination growth and rule hooks). A map passes its rules to
 * the sim as data, so it can change without code changes. The first kind unlocks a building
 * colour from a week on: until then, no house or destination may use that colour.
 */

export type MapRule = { kind: 'unlockColour'; colour: number; week: number };

/** Whether a building colour may be used at the state's current tick. */
export function colourUnlocked(state: SimState, colour: number): boolean {
  const week = weekOf(state.tick);
  return state.rules.every(
    (r) => r.kind !== 'unlockColour' || r.colour !== colour || week >= r.week,
  );
}
