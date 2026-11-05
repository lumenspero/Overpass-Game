import type { Building, Side, Wing } from './buildings.ts';
import { isBuildable, type Grid } from './grid.ts';
import type { SimState } from './sim.ts';

/**
 * Destination parking lots (spec: Parking lots and building kinds, M9a). A single lot is 5 tiles
 * long and 3 deep, with a 3×3 building at one end and a 2×3 strip at the other. A double lot is 5
 * long and 6 deep: two 3×3 buildings side by side across its depth, with a 2×6 strip at the road
 * end. A double lot starts with its near building, and its far building arrives later. The road
 * runs along one long edge. The inlet is the strip tile on the road edge, farthest from the
 * buildings. Houses have no lot; they keep the entrance tile.
 */

/** A single lot holds one building; a double lot holds two, one behind the other. */
export type LotKind = 'single' | 'double';
/** Which inlet a car drives in through: the near road's, or a double lot's far one. */
export type Inlet = 'near' | 'far';

/** The standard lot: along the road, in tiles. */
export const LOT_LENGTH = 5;
/** A single lot is this deep, from the road to its far edge, in tiles. */
export const LOT_DEPTH = 3;
/** A double lot is this deep. */
export const DOUBLE_LOT_DEPTH = 6;
/** Each destination building is square. */
export const BUILDING_SIZE = 3;
/** The open strip at the road end: the tiles left over once the buildings are placed along the lot. */
export const STRIP_LENGTH = LOT_LENGTH - BUILDING_SIZE;

/** How deep a lot of this kind is, in tiles. */
export function lotDepth(kind: LotKind): number {
  return kind === 'double' ? DOUBLE_LOT_DEPTH : LOT_DEPTH;
}

/** The lot a building belongs to: its owner's id for a far building, otherwise its own id. */
export function lotOwnerId(b: Building): number {
  return b.lotOwner ?? b.id;
}

export interface Lot {
  /** The building's own tiles: the whole footprint for a single lot, one half of a double lot. */
  footprint: number[];
  /** Every tile of the lot. */
  tiles: number[];
  /** The open strip's tiles, which hold the parking spaces and the turn. */
  strip: number[];
  /** The strip tile on the road edge, at the end farthest from the buildings. Cars drive in here. */
  inlet: number;
  /** The road tile the inlet joins. */
  road: number;
  /** A double lot's far inlet, on its far edge, and the road tile beyond it. Absent for other lots. */
  farInlet?: number;
  farRoad?: number;
}

/**
 * A point in the lot's own frame, with the road on the north side. `a` runs along the road
 * (0 to 4), with 0 at the strip end. `d` runs away from the road (0 is the road edge). The road is
 * at d = -1. Each side maps this frame onto the map.
 */
interface Frame {
  a: number;
  d: number;
}

/**
 * Maps a point in the lot frame to a box offset, where the box's top-left is (0, 0). A north or
 * south road gives a box 5 wide and `depth` deep; an east or west road gives the other way round.
 */
function toBox(
  side: Side,
  { a, d }: Frame,
  depth: number,
): { x: number; y: number } {
  switch (side) {
    case 'n':
      return { x: a, y: d };
    case 's':
      return { x: LOT_LENGTH - 1 - a, y: depth - 1 - d };
    case 'e':
      return { x: depth - 1 - d, y: a };
    case 'w':
      return { x: d, y: LOT_LENGTH - 1 - a };
  }
}

/** Whether a lot tile belongs to the building in `wing`. The strip never does. */
function inFootprint(kind: LotKind, wing: Wing, a: number, d: number): boolean {
  if (a < STRIP_LENGTH) return false;
  if (kind === 'single') return true;
  return (wing === 'near') === d < BUILDING_SIZE;
}

/**
 * The lot for a destination whose lot box starts at tile `origin` (its top-left tile) and whose
 * road is on `side`. `wing` picks the half of a double lot. Returns null when any part of the lot,
 * or its road tile, is off the map.
 */
export function lotAt(
  grid: Grid,
  origin: number,
  side: Side,
  kind: LotKind = 'single',
  wing: Wing = 'near',
): Lot | null {
  const ox = origin % grid.cols;
  const oy = Math.floor(origin / grid.cols);
  const depth = lotDepth(kind);
  const tileOf = (a: number, d: number): number | null => {
    const b = toBox(side, { a, d }, depth);
    const col = ox + b.x;
    const row = oy + b.y;
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
    return row * grid.cols + col;
  };
  const footprint: number[] = [];
  const tiles: number[] = [];
  const strip: number[] = [];
  for (let a = 0; a < LOT_LENGTH; a++) {
    for (let d = 0; d < depth; d++) {
      const t = tileOf(a, d);
      if (t === null) return null;
      tiles.push(t);
      if (a < STRIP_LENGTH) strip.push(t);
      else if (inFootprint(kind, wing, a, d)) footprint.push(t);
    }
  }
  // The inlet is on the road edge (d = 0) at the strip end (a = 0), the farthest point from the buildings.
  const road = tileOf(0, -1);
  const inlet = tileOf(0, 0);
  if (road === null || inlet === null) return null;
  const lot: Lot = { footprint, tiles, strip, inlet, road };
  if (kind === 'double') {
    // A double lot's far inlet is the far-edge strip tile, reached from the road beyond the far edge.
    const farRoad = tileOf(0, depth);
    const farInlet = tileOf(0, depth - 1);
    if (farRoad !== null && farInlet !== null) {
      lot.farRoad = farRoad;
      lot.farInlet = farInlet;
    }
  }
  return lot;
}

/** The lot a destination occupies, from its origin, its road side, and its kind and wing. */
export function destinationLot(grid: Grid, b: Building): Lot | null {
  return lotAt(grid, b.tile, b.entrance, b.lot ?? 'single', b.wing ?? 'near');
}

/** The road tiles a lot connects to: its near road, and its far road where a double lot has one. */
export function lotRoads(lot: Lot): number[] {
  return lot.farRoad === undefined ? [lot.road] : [lot.road, lot.farRoad];
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
 * Why a destination cannot spawn with this origin, road side and lot kind, or null when it can.
 * Every lot tile is checked. A road that is not yet placed does not block the spawn, as with houses.
 */
export function lotBlocker(
  sim: SimState,
  origin: number,
  side: Side,
  kind: LotKind = 'single',
): LotReason | null {
  const lot = lotAt(sim.grid, origin, side, kind, 'near');
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
 * The driving lane of a single lot (M9a step 1). A car drives in from the access road node by the
 * outer lane, along the far edge, back by the inner return, and out to the node.
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
 * Parking spaces for `count` diagonal spaces, stacked along the strip with a gap between them.
 * Each is a parallelogram between a = 0.75 and a = 1.75, sloping (1, 0.25) per tile. The spaces
 * sit to the far side of the outbound lane (a = 0.625), so cars leaving never cross a space's corner.
 */
function makeSpaces(count: number): FramePoint[][] {
  return Array.from({ length: count }, (_, k) => {
    const d0 = 0.45 + k * 0.65;
    return [
      { a: 0.75, d: d0 },
      { a: 1.75, d: d0 + 0.25 },
      { a: 1.75, d: d0 + 0.85 },
      { a: 0.75, d: d0 + 0.6 },
    ];
  });
}

/**
 * How many spaces fit down a strip of this depth, at the spaces' pitch. The first space starts
 * 0.45 in from the road, and the last must end a quarter tile short of the far edge.
 */
export function spaceCount(depth: number): number {
  const first = 0.45;
  const pitch = 0.65;
  const span = 0.85;
  const margin = 0.25;
  return Math.floor((depth - margin - span - first) / pitch) + 1;
}

/** Three spaces, for a single lot. */
export const PARKING_SPACES: FramePoint[][] = makeSpaces(spaceCount(LOT_DEPTH));
/** Seven spaces, for a double lot: the strip's full depth, at the same pitch. */
export const DOUBLE_PARKING_SPACES: FramePoint[][] = makeSpaces(
  spaceCount(DOUBLE_LOT_DEPTH),
);

/** The parking spaces of a lot of this kind. */
export function spacesFor(kind: LotKind): FramePoint[][] {
  return kind === 'double' ? DOUBLE_PARKING_SPACES : PARKING_SPACES;
}

/** A lot-frame point mapped to a box offset in tiles, for one road side. Continuous, unlike toBox. */
function boxPoint(
  side: Side,
  a: number,
  d: number,
  depth: number,
): { x: number; y: number } {
  switch (side) {
    case 'n':
      return { x: a, y: d };
    case 's':
      return { x: LOT_LENGTH - a, y: depth - d };
    case 'e':
      return { x: depth - d, y: a };
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
  kind: LotKind = 'single',
): {
  lane: { x: number; y: number }[];
  spaces: { x: number; y: number }[][];
} | null {
  if (!lotAt(grid, origin, side, kind)) return null;
  const ox = origin % grid.cols;
  const oy = Math.floor(origin / grid.cols);
  const depth = lotDepth(kind);
  const place = ({ a, d }: FramePoint) => {
    const p = boxPoint(side, a, d, depth);
    return { x: ox + p.x, y: oy + p.y };
  };
  return {
    lane: DRIVING_LANE.map(place),
    spaces: spacesFor(kind).map((space) => space.map(place)),
  };
}

/**
 * The lot-frame points a car drives through: `in` from the road node into space `k`, `out` from
 * space `k` back to the node. The lane sits a quarter of a tile off the inlet's centre, on the
 * right of its travel: the inbound lane at a = 0.25, the outbound at 0.625. It stays in the lot
 * until the slope to the space, so the car parks nose-in diagonally along the space's slope.
 */
export function spacePath(
  k: number,
  phase: 'in' | 'out',
  kind: LotKind = 'single',
  inlet: Inlet = 'near',
  tabA?: number,
): FramePoint[] {
  if (inlet === 'far') return spacePathFar(k, phase, kind, tabA);
  const space = spacesFor(kind)[k];
  if (!space) throw new Error(`no parking space ${k}`);
  const dk = space.reduce((sum, p) => sum + p.d, 0) / space.length;
  const node = { a: 0.5, d: -0.5 };
  // Where the car crosses the lot's edge: given by the caller, so the car turns on to or off the road
  // the way it is going, or a default either side of the inlet's centre.
  // The inlet road is centred on a = 0.5 and each lane is a quarter-tile wide, so the lanes sit at 0.375 and 0.625.
  const lane = tabA ?? (phase === 'in' ? 0.375 : 0.625);
  const tab = { a: lane, d: 0 };
  const centre = { a: 1.25, d: dk };
  // The back point lies on the space's slope (1, 0.25) back from the centre, so the last leg follows it.
  const back = { a: lane, d: dk - (centre.a - lane) * 0.25 };
  return phase === 'in' ? [node, tab, back, centre] : [centre, back, tab, node];
}

/** A point on the map, in tiles. */
export interface LotPoint {
  x: number;
  y: number;
}

/** The far lane's place on the far edge, in the lot frame: the car comes in on the right, a little off the inlet's centre. */
const FAR_TAB_A = 0.625;
/** Where the far lane turns toward the spaces: on the building side of the strip, clear of the spaces. */
const FAR_TURN_A = 1.9;
/** How far in from the far edge the far lane runs. */
const FAR_EDGE_INSET = 0.375;
/** Where a space is centred across the strip, as in `spacePath`. */
const SPACE_CENTRE_A = 1.25;

/**
 * The lot-frame points for a car that drives in through a double lot's far inlet, or out through
 * it. It drives along the far edge, in front of the far building, turns in at the building side of
 * the strip, and angles into its space on the same slope as the near approach. The spaces do not
 * change. Only double lots have a far inlet.
 */
export function spacePathFar(
  k: number,
  phase: 'in' | 'out',
  kind: LotKind = 'double',
  tabA: number = FAR_TAB_A,
): FramePoint[] {
  const space = spacesFor(kind)[k];
  if (!space) throw new Error(`no parking space ${k}`);
  const depth = lotDepth(kind);
  const dk = space.reduce((sum, p) => sum + p.d, 0) / space.length;
  const node = { a: 0.5, d: depth + 0.5 };
  const edge = depth - FAR_EDGE_INSET;
  const tab = { a: tabA, d: edge };
  const turn = { a: FAR_TURN_A, d: edge };
  // On the space's slope back from the centre, so the last leg follows the same line.
  const back = { a: FAR_TURN_A, d: dk + (FAR_TURN_A - SPACE_CENTRE_A) * 0.25 };
  const centre = { a: SPACE_CENTRE_A, d: dk };
  return phase === 'in'
    ? [node, tab, turn, back, centre]
    : [centre, back, turn, tab, node];
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
  inlet: Inlet = 'near',
  tabA?: number,
): LotPoint[] | null {
  const kind = b.lot ?? 'single';
  const lot = lotAt(grid, b.tile, b.entrance, kind);
  if (!lot) return null;
  if (inlet === 'far' && lot.farRoad === undefined) return null;
  const ox = b.tile % grid.cols;
  const oy = Math.floor(b.tile / grid.cols);
  const depth = lotDepth(kind);
  return spacePath(k, phase, kind, inlet, tabA).map(({ a, d }) => {
    const p = boxPoint(b.entrance, a, d, depth);
    return { x: ox + p.x, y: oy + p.y };
  });
}
