import { TILE_SIZE } from '@overpass-game/render-style';
import {
  type Building,
  buildingCentre,
  type Demand,
  type Grid,
  OVERFLOW_TICKS,
} from '@overpass-game/sim';
import { DESTINATION_RADIUS } from './geometry.ts';

/**
 * The countdown ring round an overflowing destination (spec: Overflow). It starts full
 * and empties as the countdown runs out. Pure: no Phaser, so it is unit-tested directly.
 */

export interface OverflowRing {
  x: number;
  y: number;
  /** Radius in world units, just outside the destination's disc. */
  r: number;
  /** How much of the countdown is left, from 0 to 1. */
  fraction: number;
}

/** Gap between a destination's disc and its ring, in world units. */
const RING_GAP = 4;

export function overflowRings(
  buildings: readonly Building[],
  demand: Readonly<Record<number, Demand>>,
  grid: Grid,
): OverflowRing[] {
  const r = DESTINATION_RADIUS + RING_GAP;
  const out: OverflowRing[] = [];
  for (const b of buildings) {
    if (b.kind !== 'destination') continue;
    const d = demand[b.id];
    if (!d || d.overflow <= 0) continue;
    const c = buildingCentre(grid, b);
    out.push({
      x: c.x * TILE_SIZE,
      y: c.y * TILE_SIZE,
      r,
      fraction: d.overflow / OVERFLOW_TICKS,
    });
  }
  return out;
}
