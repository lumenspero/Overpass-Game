import type { Building, Side } from './buildings.ts';
import { isOpenTile } from './expansion.ts';
import { isBuildable, type Grid } from './grid.ts';
import type { SimState } from './sim.ts';

/**
 * Destination parking lots (spec: Parking lots and building kinds, M9a). A standard lot is 5
 * tiles long and 3 deep. The road runs along one long edge. The destination's 3×3 building sits
 * at one end of the lot, and the 2×3 strip at the other end is left open for the parking spaces
 * and the turn. The inlet is the strip tile on the road edge, at the end farthest from the
 * building. Houses have no lot; they keep the entrance tile.
 */

/** The standard lot: along the road, and deep (from the road to the far edge), in tiles. */
export const LOT_LENGTH = 5;
export const LOT_DEPTH = 3;
/** The destination building is square, at the end of the lot away from the strip. */
export const BUILDING_SIZE = 3;
/** The open strip at the other end: the tiles left over once the building is placed along the lot. */
export const STRIP_LENGTH = LOT_LENGTH - BUILDING_SIZE;

export interface Lot {
  /** The 3×3 building's tiles. */
  footprint: number[];
  /** All fifteen tiles of the lot. */
  tiles: number[];
  /** The open strip's tiles, which hold the parking spaces and the turn. */
  strip: number[];
  /** The strip tile on the road edge, at the end farthest from the building. Cars drive in here. */
  inlet: number;
  /** The road tile the inlet joins. */
  road: number;
}

/**
 * A point in the lot's own frame, with the road on the north side. `a` runs along the road
 * (0 to 4), with 0 at the strip end. `d` runs away from the road (0 is the road edge, 2 the far
 * edge). The road is at d = -1. Each side maps this frame onto the map.
 */
interface Frame {
  a: number;
  d: number;
}

/**
 * Maps a point in the lot frame to a box offset, where the box's top-left is (0, 0). A north or
 * south road gives a 5×3 box; an east or west road gives a 3×5 box.
 */
function toBox(side: Side, { a, d }: Frame): { x: number; y: number } {
  switch (side) {
    case 'n':
      return { x: a, y: d };
    case 's':
      return { x: LOT_LENGTH - 1 - a, y: LOT_DEPTH - 1 - d };
    case 'e':
      return { x: LOT_DEPTH - 1 - d, y: a };
    case 'w':
      return { x: d, y: LOT_LENGTH - 1 - a };
  }
}

/**
 * The lot for a destination whose lot box starts at tile `origin` (its top-left tile) and whose
 * road is on `side`. Returns null when any part of the lot, or its road tile, is off the map.
 */
export function lotAt(grid: Grid, origin: number, side: Side): Lot | null {
  const ox = origin % grid.cols;
  const oy = Math.floor(origin / grid.cols);
  const tileOf = (a: number, d: number): number | null => {
    const b = toBox(side, { a, d });
    const col = ox + b.x;
    const row = oy + b.y;
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
    return row * grid.cols + col;
  };
  const footprint: number[] = [];
  const tiles: number[] = [];
  const strip: number[] = [];
  for (let a = 0; a < LOT_LENGTH; a++) {
    for (let d = 0; d < LOT_DEPTH; d++) {
      const t = tileOf(a, d);
      if (t === null) return null;
      tiles.push(t);
      if (a < STRIP_LENGTH) strip.push(t);
      else footprint.push(t);
    }
  }
  // The inlet is on the road edge (d = 0) at the strip end (a = 0), the farthest point from the building.
  const road = tileOf(0, -1);
  const inlet = tileOf(0, 0);
  if (road === null || inlet === null) return null;
  return { footprint, tiles, strip, inlet, road };
}

/** The lot a destination occupies, from its origin and the side its road is on. */
export function destinationLot(grid: Grid, b: Building): Lot | null {
  return lotAt(grid, b.tile, b.entrance);
}

/** Every tile reserved by the lots of destinations already placed. */
export function reservedLotTiles(sim: SimState): Set<number> {
  const out = new Set<number>();
  for (const b of sim.buildings) {
    if (b.kind !== 'destination') continue;
    const lot = destinationLot(sim.grid, b);
    if (lot) for (const t of lot.tiles) out.add(t);
  }
  return out;
}

export type LotReason =
  'no-lot' | 'unbuildable' | 'locked' | 'road' | 'occupied' | 'reserved';

/**
 * Why a destination cannot spawn with this origin and road side, or null when it can. Every lot
 * tile is checked. A road that is not yet placed does not block the spawn, as with houses.
 */
export function lotBlocker(
  sim: SimState,
  origin: number,
  side: Side,
): LotReason | null {
  const lot = lotAt(sim.grid, origin, side);
  if (!lot) return 'no-lot';
  const reserved = reservedLotTiles(sim);
  for (const t of lot.tiles) {
    if (!isBuildable(sim.grid, t)) return 'unbuildable';
    if (!isOpenTile(sim, t)) return 'locked';
    if (sim.roads[t] === 1) return 'road';
    if (sim.buildingAt[t] !== -1) return 'occupied';
    if (reserved.has(t)) return 'reserved';
  }
  return null;
}
