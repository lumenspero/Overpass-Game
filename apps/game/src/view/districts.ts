import { TILE_SIZE } from '@overpass-game/render-style';
import { type Grid, openDistricts } from '@overpass-game/sim';

/**
 * Locked districts are dimmed (spec: Expansion). Pure: no Phaser, so it is unit-tested directly.
 */

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The rectangles covering every tile in a district that is not open at this tick. */
export function lockedTileRects(
  grid: Grid,
  districtOf: readonly number[],
  tick: number,
): TileRect[] {
  const open = openDistricts(tick);
  const out: TileRect[] = [];
  for (let i = 0; i < districtOf.length; i++) {
    if (districtOf[i] < open) continue;
    out.push({
      x: (i % grid.cols) * TILE_SIZE,
      y: Math.floor(i / grid.cols) * TILE_SIZE,
      w: TILE_SIZE,
      h: TILE_SIZE,
    });
  }
  return out;
}
