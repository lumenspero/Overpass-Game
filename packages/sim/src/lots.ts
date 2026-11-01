import type { Side } from './buildings.ts';
import type { Grid } from './grid.ts';

/**
 * Destination parking lots (spec: Parking lots and building kinds, M9a). A standard lot is 3
 * tiles across and 2 deep. The destination's 2×2 building sits on one side of it, leaving an
 * open strip of 2 tiles on the other. The inlet is the strip tile that touches the road, so a
 * car drives in from the road through the inlet. Houses have no lot; they keep the entrance tile.
 */

/** Lot size across and deep, in tiles, when the road is on the north or south side. */
export const LOT_ACROSS = 3;
export const LOT_DEPTH = 2;

export interface Lot {
  /** The 2×2 building's tiles. */
  footprint: number[];
  /** All six tiles of the lot: the building's four and the open strip's two. */
  tiles: number[];
  /** The open tile that touches the road. Cars drive in here. */
  inlet: number;
  /** The road tile the inlet joins. */
  road: number;
  /** The open tile beside the building, where a car stops to finish its trip. */
  stop: number;
}

/**
 * A point in the lot's own frame. `u` runs across the lot (0 to 2), and `v` runs from the
 * building side (0 and 1) to the road side (-1). Each side maps this frame onto the map.
 */
interface Frame {
  u: number;
  v: number;
}

/**
 * Maps a point in the lot frame to a box offset, where the box's top-left is (0, 0). A north or
 * south road gives a 3×2 box; an east or west road gives a 2×3 box.
 */
function toBox(side: Side, { u, v }: Frame): { x: number; y: number } {
  switch (side) {
    case 'n':
      return { x: u, y: v };
    case 's':
      return { x: 2 - u, y: 1 - v };
    case 'e':
      return { x: 1 - v, y: u };
    case 'w':
      return { x: v, y: 2 - u };
  }
}

/**
 * The lot for a destination whose lot box starts at tile `origin` (its top-left tile) and whose
 * road is on `side`. Returns null when any part of the lot, or its road tile, is off the map.
 */
export function lotAt(grid: Grid, origin: number, side: Side): Lot | null {
  const ox = origin % grid.cols;
  const oy = Math.floor(origin / grid.cols);
  const tileOf = (f: Frame): number | null => {
    const b = toBox(side, f);
    const col = ox + b.x;
    const row = oy + b.y;
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
    return row * grid.cols + col;
  };
  const footprint: number[] = [];
  const tiles: number[] = [];
  for (let u = 0; u < LOT_ACROSS; u++) {
    for (let v = 0; v < LOT_DEPTH; v++) {
      const t = tileOf({ u, v });
      if (t === null) return null;
      tiles.push(t);
      if (u < 2) footprint.push(t);
    }
  }
  const road = tileOf({ u: 2, v: -1 });
  if (road === null) return null;
  const inlet = tileOf({ u: 2, v: 0 });
  const stop = tileOf({ u: 2, v: 1 });
  if (inlet === null || stop === null) return null;
  return { footprint, tiles, inlet, road, stop };
}
