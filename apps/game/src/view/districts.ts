import { TILE_SIZE } from '@overpass-game/render-style';
import { type FenceEdge, type Grid } from '@overpass-game/sim';

/**
 * The dimmed land: everything outside the fence edge (spec: Expansion). The edge is not locked to
 * the grid, so a strip part-way across a tile is dimmed part-way. Pure: no Phaser, so it is
 * unit-tested directly.
 */

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Up to four rectangles, in pixels, that together cover everything outside the edge. */
export function lockedTileRects(grid: Grid, edge: FenceEdge): TileRect[] {
  const width = grid.cols * TILE_SIZE;
  const height = grid.rows * TILE_SIZE;
  const left = edge.left * TILE_SIZE;
  const top = edge.top * TILE_SIZE;
  const right = edge.right * TILE_SIZE;
  const bottom = edge.bottom * TILE_SIZE;
  const out: TileRect[] = [];
  if (top > 0) out.push({ x: 0, y: 0, w: width, h: top });
  if (bottom < height)
    out.push({ x: 0, y: bottom, w: width, h: height - bottom });
  if (left > 0) out.push({ x: 0, y: top, w: left, h: bottom - top });
  if (right < width)
    out.push({ x: right, y: top, w: width - right, h: bottom - top });
  return out;
}
