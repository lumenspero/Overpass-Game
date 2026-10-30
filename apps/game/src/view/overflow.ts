import { TILE_SIZE } from '@overpass-game/render-style';
import {
  type Building,
  type Demand,
  type Grid,
  OVERFLOW_TICKS,
} from '@overpass-game/sim';
import { BUILDING_SCALE } from './geometry.ts';

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
  const r = (TILE_SIZE * BUILDING_SCALE) / 2 + RING_GAP;
  const out: OverflowRing[] = [];
  for (const b of buildings) {
    if (b.kind !== 'destination') continue;
    const d = demand[b.id];
    if (!d || d.overflow <= 0) continue;
    out.push({
      x: ((b.tile % grid.cols) + 0.5) * TILE_SIZE,
      y: (Math.floor(b.tile / grid.cols) + 0.5) * TILE_SIZE,
      r,
      fraction: d.overflow / OVERFLOW_TICKS,
    });
  }
  return out;
}
