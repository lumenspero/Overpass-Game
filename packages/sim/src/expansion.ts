import { EXPANSION_WEEKS } from './config.ts';
import { weekOf } from './score.ts';
import type { SimState } from './sim.ts';

/**
 * Map expansion (spec: Expansion). The map is split into districts. District 0 is open at
 * the start, and each week in EXPANSION_WEEKS opens the next one. Locked tiles take no
 * roads, and buildings on them are inactive and hidden. Districts only ever open, never close.
 */

/** How many districts, counted from district 0, are open at a tick. */
export function openDistricts(tick: number): number {
  const week = weekOf(tick);
  let open = 1;
  for (const w of EXPANSION_WEEKS) if (week >= w) open += 1;
  return open;
}

/** True when a tile is in an open district. */
export function isOpenTile(state: SimState, tile: number): boolean {
  return state.districtOf[tile] < openDistricts(state.tick);
}
