import type { Building, Side } from './buildings.ts';
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
  'no-lot' | 'unbuildable' | 'road' | 'occupied' | 'reserved';

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
    if (sim.roads[t] === 1) return 'road';
    if (sim.buildingAt[t] !== -1) return 'occupied';
    if (reserved.has(t)) return 'reserved';
  }
  return null;
}

/** A point in the lot frame, in tiles: a along the road from the strip end, d away from the road. */
export interface FramePoint {
  a: number;
  d: number;
}

/**
 * The driving lane (M9a step 1). A car drives in from the access road node by the outer lane,
 * along the far edge, back by the inner return, and out to the node. Each lane is half a road
 * wide, so the loop keeps clear of the spaces inside it.
 */
export const DRIVING_LANE: FramePoint[] = [
  { a: 0.5, d: -0.5 },
  { a: 0.25, d: 0.25 },
  { a: 0.25, d: 2.75 },
  { a: 1.75, d: 2.75 },
  { a: 1.75, d: 0.25 },
  { a: 0.75, d: 0.25 },
  { a: 0.5, d: -0.5 },
];

/**
 * Three diagonal parking spaces inside the lane loop, each a parallelogram between a = 0.5 and
 * a = 1.5. They are stacked along the strip with a gap between them.
 */
export const PARKING_SPACES: FramePoint[][] = [0, 1, 2].map((k) => {
  const d0 = 0.45 + k * 0.65;
  return [
    { a: 0.5, d: d0 },
    { a: 1.5, d: d0 + 0.25 },
    { a: 1.5, d: d0 + 0.85 },
    { a: 0.5, d: d0 + 0.6 },
  ];
});

/** A lot-frame point mapped to a box offset in tiles, for one road side. Continuous, unlike toBox. */
function boxPoint(side: Side, a: number, d: number): { x: number; y: number } {
  switch (side) {
    case 'n':
      return { x: a, y: d };
    case 's':
      return { x: LOT_LENGTH - a, y: LOT_DEPTH - d };
    case 'e':
      return { x: LOT_DEPTH - d, y: a };
    case 'w':
      return { x: d, y: LOT_LENGTH - a };
  }
}

/**
 * The lane and spaces of the lot at `origin` facing `side`, in world tile units (a tile's centre is
 * at +0.5). Null when the lot is off the map.
 */
export function stripLayout(
  grid: Grid,
  origin: number,
  side: Side,
): {
  lane: { x: number; y: number }[];
  spaces: { x: number; y: number }[][];
} | null {
  if (!lotAt(grid, origin, side)) return null;
  const ox = origin % grid.cols;
  const oy = Math.floor(origin / grid.cols);
  const place = ({ a, d }: FramePoint) => {
    const p = boxPoint(side, a, d);
    return { x: ox + p.x, y: oy + p.y };
  };
  return {
    lane: DRIVING_LANE.map(place),
    spaces: PARKING_SPACES.map((space) => space.map(place)),
  };
}

/**
 * The lot-frame points a car drives through: `in` from the road node into space `k`, `out` from
 * space `k` back to the node. The lane runs down the middle of the inlet tab (a = 0.5). A space
 * slopes (1, 0.25) per tile, so the drive ends along that slope, and the car parks nose-in
 * diagonally. `back` is half a tile before the space's middle, on the slope.
 */
export function spacePath(k: number, phase: 'in' | 'out'): FramePoint[] {
  const space = PARKING_SPACES[k];
  if (!space) throw new Error(`no parking space ${k}`);
  const dk = space.reduce((sum, p) => sum + p.d, 0) / space.length;
  const node = { a: 0.5, d: -0.5 };
  // Each lane sits a quarter of a tile off the inlet's centre, on the right of its travel.
  // The inbound lane runs at a = 0.375, the outbound at 0.625, and stays in the lot until the
  // slope to the space: a line from the middle of the space at a = 0.375 or 0.625.
  const lane = phase === 'in' ? 0.375 : 0.625;
  const tab = { a: lane, d: 0 };
  const back = { a: lane, d: dk - (1 - lane) * 0.25 };
  const centre = { a: 1, d: dk };
  return phase === 'in' ? [node, tab, back, centre] : [centre, back, tab, node];
}

/**
 * Rounds the corners of a path, so a car turns through a curve rather than snapping its heading.
 * Each corner becomes a quadratic curve that starts and ends `radius` tiles from the corner. The
 * curve is limited to half of each adjacent segment, so neighbouring corners never overlap.
 */
export function roundedPath(points: LotPoint[], radius = 0.3): LotPoint[] {
  if (points.length < 3) return points.map((q) => ({ ...q }));
  const SAMPLES = 6;
  const out: LotPoint[] = [{ ...points[0] }];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1];
    const c = points[i];
    const n = points[i + 1];
    const inLen = Math.hypot(c.x - p.x, c.y - p.y);
    const outLen = Math.hypot(n.x - c.x, n.y - c.y);
    const cross = (c.x - p.x) * (n.y - c.y) - (c.y - p.y) * (n.x - c.x);
    if (inLen === 0 || outLen === 0 || Math.abs(cross) < 1e-9) {
      out.push({ ...c });
      continue;
    }
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a = {
      x: c.x + ((p.x - c.x) / inLen) * r,
      y: c.y + ((p.y - c.y) / inLen) * r,
    };
    const b = {
      x: c.x + ((n.x - c.x) / outLen) * r,
      y: c.y + ((n.y - c.y) / outLen) * r,
    };
    out.push(a);
    for (let k = 1; k <= SAMPLES; k++) {
      const t = k / SAMPLES;
      const u = 1 - t;
      out.push({
        x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      });
    }
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

/** A point on the map, in tiles. */
export interface LotPoint {
  x: number;
  y: number;
}

/**
 * The map points of a car's drive into, or out of, space `k` of the destination `b`'s lot. Null
 * when the lot is off the map.
 */
export function lotPath(
  grid: Grid,
  b: Building,
  k: number,
  phase: 'in' | 'out',
): LotPoint[] | null {
  if (!lotAt(grid, b.tile, b.entrance)) return null;
  const ox = b.tile % grid.cols;
  const oy = Math.floor(b.tile / grid.cols);
  return spacePath(k, phase).map(({ a, d }) => {
    const p = boxPoint(b.entrance, a, d);
    return { x: ox + p.x, y: oy + p.y };
  });
}
