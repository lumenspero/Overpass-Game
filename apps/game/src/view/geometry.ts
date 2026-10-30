import { ROAD_WIDTH_TILES, TILE_SIZE } from '@overpass-game/render-style';
import {
  type Building,
  type Car,
  type Links,
  type Grid,
  Terrain,
  type TerrainKind,
} from '@overpass-game/sim';
import {
  curveFrom,
  type Motorway,
  motorwayBetween,
  pointAtDistance,
} from '@overpass-game/sim';

/**
 * Drawing geometry derived from sim state. Pure: no Phaser, so it is unit-tested
 * directly. World units, one tile = TILE_SIZE.
 */

export type RoadShape =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; w: number };

/**
 * Shapes that cover every road tile. Each tile gets a disc at its centre, which
 * rounds every end and junction. Each stored link gets a bar between its two tile
 * centres, the same width as the disc diameter, so an edge link is a rectangle and a
 * corner link a diagonal line. Filled opaquely, the union looks like one rounded road network.
 */
export function roadShapes(
  grid: Grid,
  roads: readonly number[],
  links: Links,
): RoadShape[] {
  const r = (ROAD_WIDTH_TILES * TILE_SIZE) / 2;
  const out: RoadShape[] = [];
  const centre = (i: number) => ({
    x: ((i % grid.cols) + 0.5) * TILE_SIZE,
    y: (Math.floor(i / grid.cols) + 0.5) * TILE_SIZE,
  });
  for (let i = 0; i < roads.length; i++) {
    if (roads[i] !== 1) continue;
    const c = centre(i);
    out.push({ kind: 'circle', x: c.x, y: c.y, r });
  }
  // Each link once: from the tile to a partner further on in the index.
  for (const key of Object.keys(links)) {
    const a = Number(key);
    for (const b of links[key]) {
      if (b <= a) continue;
      const from = centre(a);
      const to = centre(b);
      out.push({
        kind: 'line',
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        w: 2 * r,
      });
    }
  }
  return out;
}

/**
 * A road-width bar from each building's entrance tile to the building's own centre, when
 * the entrance tile is a road. The road itself only reaches its tile's centre, so without
 * this bar the entrance tick floats in a gap; the building covers the bar's far end.
 */
export function entranceStubShapes(
  buildings: readonly Building[],
  grid: Grid,
  roads: readonly number[],
): RoadShape[] {
  const r = (ROAD_WIDTH_TILES * TILE_SIZE) / 2;
  const out: RoadShape[] = [];
  for (const b of buildings) {
    const { dx, dy } = SIDE_STEP[b.entrance];
    const entrance = b.tile + dy * grid.cols + dx;
    if (roads[entrance] !== 1) continue;
    const bx = ((b.tile % grid.cols) + 0.5) * TILE_SIZE;
    const by = (Math.floor(b.tile / grid.cols) + 0.5) * TILE_SIZE;
    const ex = ((entrance % grid.cols) + 0.5) * TILE_SIZE;
    const ey = (Math.floor(entrance / grid.cols) + 0.5) * TILE_SIZE;
    out.push({ kind: 'line', x1: ex, y1: ey, x2: bx, y2: by, w: 2 * r });
  }
  return out;
}

export interface TerrainTile {
  x: number;
  y: number;
  kind: Exclude<TerrainKind, typeof Terrain.Land | typeof Terrain.OutOfBounds>;
}

/** Top-left world position of every non-land tile. Land is the map background. */
export function terrainTiles(grid: Grid): TerrainTile[] {
  const out: TerrainTile[] = [];
  for (let i = 0; i < grid.terrain.length; i++) {
    const kind = grid.terrain[i];
    if (kind === Terrain.Land || kind === Terrain.OutOfBounds) continue;
    out.push({
      x: (i % grid.cols) * TILE_SIZE,
      y: Math.floor(i / grid.cols) * TILE_SIZE,
      kind,
    });
  }
  return out;
}

export type BuildingShape =
  | { kind: 'square'; x: number; y: number; size: number; color: number }
  | { kind: 'circle'; x: number; y: number; r: number; color: number }
  | { kind: 'entrance'; x1: number; y1: number; x2: number; y2: number };

export const BUILDING_SCALE = 0.6; // building body as a fraction of one tile
export const ENTRANCE_WIDTH = 3;

/** Unit step for each entrance side (y grows downwards). */
const SIDE_STEP = {
  n: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 },
  s: { dx: 0, dy: 1 },
  w: { dx: -1, dy: 0 },
} as const;

export type CarShape = { x: number; y: number; r: number; color: number };

const ROAD_HALF_WIDTH = (ROAD_WIDTH_TILES * TILE_SIZE) / 2;
/** Cars drive on the right, so each lane's centre sits a quarter road width from the road centre. */
export const LANE_OFFSET = ROAD_HALF_WIDTH / 2;
/** Car dot radius: well inside its lane, so a car never reaches the road's centre line or edge. */
const CAR_RADIUS = ROAD_HALF_WIDTH * 0.4;

/**
 * One dot per car, at its position on its route. Within a tile the car follows a
 * quadratic curve from the edge it came in by, through the tile centre, to the edge
 * it leaves by. On a straight the curve is a line; on a bend it rounds the corner
 * the same way the road's centre disc does, so cars don't cut across corners.
 * The curve is offset to the right of the direction of travel, so cars keep to the
 * right. Its colour is its house's colour.
 */
/** The lane offset to the right of a direction of travel. Diagonal directions are normalised. */
function rightOfTravel(d: { dx: number; dy: number }): {
  x: number;
  y: number;
} {
  const len = Math.hypot(d.dx, d.dy);
  return { x: (-d.dy / len) * LANE_OFFSET, y: (d.dx / len) * LANE_OFFSET };
}

export function carShapes(
  cars: readonly Car[],
  buildings: readonly Building[],
  grid: Grid,
  colors: readonly number[],
  motorways: readonly Motorway[] = [],
): CarShape[] {
  const out: CarShape[] = [];
  const half = TILE_SIZE / 2;
  const centre = (tile: number) => ({
    x: ((tile % grid.cols) + 0.5) * TILE_SIZE,
    y: (Math.floor(tile / grid.cols) + 0.5) * TILE_SIZE,
  });
  /** The road tile in front of a building's entrance. */
  const entranceOf = (b: Building): number => {
    const { dx, dy } = SIDE_STEP[b.entrance];
    return b.tile + dy * grid.cols + dx;
  };
  /** Unit step from tile `a` to the adjacent tile `b`. */
  const step = (a: number, b: number) => ({
    dx: Math.sign((b % grid.cols) - (a % grid.cols)),
    dy: Math.sign(Math.floor(b / grid.cols) - Math.floor(a / grid.cols)),
  });
  for (const car of cars) {
    const { route, progress, along } = car;
    const tile = route[progress];
    const prev = progress > 0 ? route[progress - 1] : null;
    const next = progress < route.length - 1 ? route[progress + 1] : null;
    // Direction of travel in and out of this tile. A car on its last tile keeps going in the same direction.
    const inRaw = prev !== null ? step(prev, tile) : null;
    const outRaw = next !== null ? step(tile, next) : inRaw;
    const c = centre(tile);
    let x = c.x;
    let y = c.y;
    // A car on its first tile enters as it leaves; a car on its last tile leaves as it came in.
    const inDir = inRaw ?? outRaw;
    const outDir = outRaw ?? inRaw;
    if (inDir && outDir) {
      // Each edge point sits in the lane on the right of the direction through it.
      const nIn = rightOfTravel(inDir);
      const nOut = rightOfTravel(outDir);
      // Quadratic Bézier: start on the entry edge, control at the centre, end on the exit edge.
      const ax = c.x - inDir.dx * half + nIn.x;
      const ay = c.y - inDir.dy * half + nIn.y;
      const bx = c.x + outDir.dx * half + nOut.x;
      const by = c.y + outDir.dy * half + nOut.y;
      const cx = c.x + (nIn.x + nOut.x) / 2;
      const cy = c.y + (nIn.y + nOut.y) / 2;
      const u = 1 - along;
      x = u * u * ax + 2 * u * along * cx + along * along * bx;
      y = u * u * ay + 2 * u * along * cy + along * along * by;
    }
    // A car enters its building on arrival, parks at its centre, and leaves from that
    // centre, so it never appears in the gap beside the road.
    // Motorways (spec: Motorways). A car leaving by motorway eases from its road onto the
    // curve over the first ramp; a car arriving by motorway runs from the curve's end onto
    // the road it leaves by. Both keep the car on the ground road's line where they meet.
    const rideOut =
      next !== null ? motorwayBetween(motorways, tile, next) : null;
    const inMotorway =
      prev !== null ? motorwayBetween(motorways, prev, tile) : null;
    const rideIn = inMotorway !== null;
    const home =
      buildings[car.state === 'returning' ? car.destination : car.house];
    const fromHome =
      home !== undefined && progress === 0 && tile === entranceOf(home);
    const edgeIn = (d: { dx: number; dy: number }) => {
      const n = rightOfTravel(d);
      return { x: c.x - d.dx * half + n.x, y: c.y - d.dy * half + n.y };
    };
    const edgeOut = (d: { dx: number; dy: number }) => {
      const n = rightOfTravel(d);
      return { x: c.x + d.dx * half + n.x, y: c.y + d.dy * half + n.y };
    };
    /** Where a motorway ride into this tile ends, in world units. */
    const rideInStart = (): { x: number; y: number } => {
      const arc =
        inMotorway && prev !== null ? curveFrom(grid, inMotorway, prev) : null;
      const end = arc ? arc[arc.length - 1] : null;
      return end
        ? { x: end.x * TILE_SIZE, y: end.y * TILE_SIZE }
        : { x: c.x, y: c.y };
    };
    if (rideOut) {
      const enter =
        fromHome && home
          ? centre(home.tile)
          : prev !== null && !rideIn && inRaw
            ? edgeIn(inRaw)
            : c;
      const s = along * rideOut.length;
      const curve = curveFrom(grid, rideOut, tile);
      // The ramp is the first two tiles of the curve. Over it the car follows a smooth curve that
      // starts along its road, through the road's entry edge, and joins the motorway's curve
      // with the same direction, so it never cuts across the corner.
      const ramp = Math.max(1e-6, Math.min(2, rideOut.length / 3));
      const at = (d: number) =>
        pointAtDistance(curve, Math.min(rideOut.length, Math.max(0, d)));
      if (s >= ramp) {
        const onCurve = at(s);
        x = onCurve.x * TILE_SIZE;
        y = onCurve.y * TILE_SIZE;
      } else {
        const t = s / ramp;
        const joint = at(ramp);
        const p1 = { x: joint.x * TILE_SIZE, y: joint.y * TILE_SIZE };
        const before = at(ramp - 0.1);
        const jointDir = {
          x: (joint.x - before.x) * TILE_SIZE,
          y: (joint.y - before.y) * TILE_SIZE,
        };
        const k = Math.hypot(p1.x - enter.x, p1.y - enter.y);
        const unitOf = (v: { x: number; y: number }) => {
          const d = Math.hypot(v.x, v.y);
          return d > 0 ? { x: v.x / d, y: v.y / d } : { x: 0, y: 0 };
        };
        const roadDir = unitOf({ x: c.x - enter.x, y: c.y - enter.y });
        const dir0 =
          roadDir.x === 0 && roadDir.y === 0 ? unitOf(jointDir) : roadDir;
        const dir1 = unitOf(jointDir);
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        x = h00 * enter.x + h10 * k * dir0.x + h01 * p1.x + h11 * k * dir1.x;
        y = h00 * enter.y + h10 * k * dir0.y + h01 * p1.y + h11 * k * dir1.y;
      }
    } else if (rideIn && next !== null && outRaw) {
      // The car is already at the motorway's end, on the tile's entry edge, so it runs on to the exit edge.
      const start = rideInStart();
      const exit = edgeOut(outRaw);
      x = start.x + (exit.x - start.x) * along;
      y = start.y + (exit.y - start.y) * along;
    } else if (rideIn) {
      const start = rideInStart();
      x = start.x;
      y = start.y;
    }

    const arrival =
      buildings[car.state === 'returning' ? car.house : car.destination];
    const departure =
      buildings[car.state === 'returning' ? car.destination : car.house];
    if (
      route.length > 1 &&
      arrival &&
      progress === route.length - 1 &&
      tile === entranceOf(arrival)
    ) {
      const b = centre(arrival.tile);
      x += (b.x - x) * along;
      y += (b.y - y) * along;
    } else if (
      route.length > 1 &&
      departure &&
      progress === 0 &&
      tile === entranceOf(departure) &&
      !rideOut
    ) {
      const b = centre(departure.tile);
      x = b.x + (x - b.x) * along;
      y = b.y + (y - b.y) * along;
    }
    const house = buildings[car.house];
    out.push({
      x,
      y,
      r: CAR_RADIUS,
      color: (house && colors[house.color]) ?? colors[0],
    });
  }
  return out;
}

/**
 * Houses are squares, destinations are discs, each with a tick from the body to
 * the tile edge on its entrance side, so the player can see which way it faces.
 */
export function buildingShapes(
  buildings: readonly Building[],
  grid: Grid,
  colors: readonly number[],
): BuildingShape[] {
  const out: BuildingShape[] = [];
  const half = (TILE_SIZE * BUILDING_SCALE) / 2;
  for (const b of buildings) {
    const cx = ((b.tile % grid.cols) + 0.5) * TILE_SIZE;
    const cy = (Math.floor(b.tile / grid.cols) + 0.5) * TILE_SIZE;
    const color = colors[b.color] ?? colors[0];
    if (b.kind === 'house') {
      out.push({
        kind: 'square',
        x: cx - half,
        y: cy - half,
        size: 2 * half,
        color,
      });
    } else {
      out.push({ kind: 'circle', x: cx, y: cy, r: half, color });
    }
    const { dx, dy } = SIDE_STEP[b.entrance];
    out.push({
      kind: 'entrance',
      x1: cx + dx * half,
      y1: cy + dy * half,
      x2: cx + (dx * TILE_SIZE) / 2,
      y2: cy + (dy * TILE_SIZE) / 2,
    });
  }
  return out;
}
