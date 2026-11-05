import { type Car, sendHome, sendHomeAvoiding } from './cars.ts';
import { tuning } from './config.ts';
import type { Building } from './buildings.ts';
import { type Grid, roadLinks } from './grid.ts';
import {
  type LotPoint,
  lotOwnerId,
  lotPath,
  roundedPath,
  spacesFor,
  destinationLot,
  type Inlet,
} from './lots.ts';
import { polylineLength } from './motorways.ts';
import type { SimState } from './sim.ts';

/**
 * Trips through a destination's parking lot (spec: Parking lots, M9a step 2). A car that reaches
 * its destination drives in along the lot's lane to a free space, parks, then drives out and
 * rejoins the road at the lot's node. Only one car at a time may drive in or out of a lot, so two
 * cars never meet on its lane. A car in a lot is off the road: it does not block road tiles, and
 * road cars do not block it.
 *
 * Cars drive on the right of the road, a quarter of a road width from its centre, as drawn. The
 * lot paths start and end in that lane, so a car does not move onto the centre of the road.
 */

/** Where cars drive, from a tile's centre, in tiles: a quarter of a road width, to the right. */
const LANE = 0.125;

/** What a car did on reaching a destination: started its drive in, must wait, or the destination has no lot. */
export type LotStart = 'started' | 'waiting' | 'none';

/** True when no car is driving in or out of the destination's lot, so its lane is free. */
export function laneFree(
  state: SimState,
  destination: number,
  inlet: Inlet,
): boolean {
  return !state.cars.some(
    (c) =>
      c.lot !== undefined &&
      c.lot.destination === destination &&
      c.lot.inlet === inlet &&
      c.lot.phase !== 'parked' &&
      // A car waiting at the lot's edge only to join the road is no longer in the lane.
      !holdingToJoin(c),
  );
}

/** Whether a car leaving a lot has driven to the lot's edge and waits there for a gap to join the road. */
export function holdingToJoin(c: Car): boolean {
  const lot = c.lot;
  return (
    lot !== undefined &&
    lot.phase === 'out' &&
    lot.cleared !== true &&
    lot.s >= (lot.hold ?? lot.length) - 1e-9
  );
}

/** Whether a building's lot lies on the map. Cached per building, since the lot's geometry is costly to rebuild each tick. */
const lotOnMap = new WeakMap<Building, { key: string; ok: boolean }>();

function hasLotOnMap(grid: Grid, b: Building): boolean {
  const key = `${b.tile}|${b.entrance}|${b.lot ?? 'single'}|${grid.cols}|${grid.rows}`;
  const hit = lotOnMap.get(b);
  if (hit && hit.key === key) return hit.ok;
  const ok = lotPath(grid, b, 0, 'in') !== null;
  lotOnMap.set(b, { key, ok });
  return ok;
}

/**
 * Whether a car leaving a lot has left its space for good: it waits at the lot's edge or is turning on to
 * the road. Its space is free for a car arriving, so a lot whose leavers wait on traffic still takes cars in.
 */
function leftSpace(c: Car): boolean {
  return holdingToJoin(c) || c.lot?.cleared === true;
}

/**
 * True when no car is in the destination's lane at all, including one waiting at the lot's edge to join
 * the road. A car already turning on to the road has left the lane.
 */
function laneEmpty(
  state: SimState,
  destination: number,
  inlet: Inlet,
): boolean {
  return !state.cars.some(
    (c) =>
      c.lot !== undefined &&
      c.lot.destination === destination &&
      c.lot.inlet === inlet &&
      c.lot.phase !== 'parked' &&
      c.lot.cleared !== true,
  );
}

/** Which inlet a car uses, from the road tile its route reaches the lot by. */
function inletOf(
  state: SimState,
  building: Building,
  node: number | undefined,
): Inlet {
  const lot = destinationLot(state.grid, building);
  return lot?.farRoad !== undefined && lot.farRoad === node ? 'far' : 'near';
}

/** The first parking space of the lot that no car is using, or null when all are full. */
function freeSpace(state: SimState, lot: number, count: number): number | null {
  const taken = new Set<number>();
  for (const c of state.cars) {
    if (c.lot !== undefined && c.lot.destination === lot && !leftSpace(c)) {
      taken.add(c.lot.space);
    }
  }
  for (let k = 0; k < count; k++) {
    if (!taken.has(k)) return k;
  }
  return null;
}

/** The centre of a tile, in tile units. */
function centreOf(grid: Grid, tile: number): LotPoint {
  return {
    x: (tile % grid.cols) + 0.5,
    y: Math.floor(tile / grid.cols) + 0.5,
  };
}

/** The direction of a step between two adjacent tiles. */
function stepDir(
  grid: Grid,
  from: number,
  to: number,
): { dx: number; dy: number } {
  return {
    dx: (to % grid.cols) - (from % grid.cols),
    dy: Math.floor(to / grid.cols) - Math.floor(from / grid.cols),
  };
}

/** The point in a tile's lane for travel in direction `dir`: the centre, offset to the right of travel. */
function lanePoint(
  grid: Grid,
  tile: number,
  dir: { dx: number; dy: number },
): LotPoint {
  const c = centreOf(grid, tile);
  const len = Math.hypot(dir.dx, dir.dy) || 1;
  return {
    x: c.x + (-dir.dy / len) * LANE,
    y: c.y + (dir.dx / len) * LANE,
  };
}

/** The distance along a path to the point on it nearest `target`. */
function distanceTo(path: LotPoint[], target: LotPoint): number {
  let best = Infinity;
  let at = 0;
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) {
      total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    const d = Math.hypot(path[i].x - target.x, path[i].y - target.y);
    if (d < best) {
      best = d;
      at = total;
    }
  }
  return at;
}

/** Radius of the turn between the lot's edge and the road's lane, in tiles. */
const TURN_RADIUS = 0.25;
/** How far a lot's node is drawn for a car leaving it, from the centre to the exit edge, in tiles. */
const NODE_DRAWN = 0.5;
/** How far inside the lot's edge a leaving car waits for its gap in traffic, in tiles. */
const HOLD_BACK = 0.3;

function dot(a: LotPoint, b: LotPoint): number {
  return a.x * b.x + a.y * b.y;
}

function minus(a: LotPoint, b: LotPoint): LotPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** The unit vector along a step, and the one to its right: the side cars drive on. */
function axes(dir: { dx: number; dy: number }): {
  d: LotPoint;
  n: LotPoint;
} {
  const len = Math.hypot(dir.dx, dir.dy) || 1;
  return {
    d: { x: dir.dx / len, y: dir.dy / len },
    n: { x: -dir.dy / len, y: dir.dx / len },
  };
}

/**
 * Where across the inlet a car crosses the lot's edge, in the lot frame. On a road running past the lot,
 * `ahead` tiles along the lane from `lanePt` (behind it, for a negative `ahead`), so the car turns on to
 * or off the road the way it is going. On a road running away from the lot, in line with the lane.
 */
function tabFor(
  grid: Grid,
  b: Building,
  k: number,
  phase: 'in' | 'out',
  inlet: Inlet,
  lanePt: LotPoint,
  dir: { dx: number; dy: number },
  ahead: number,
): number | undefined {
  const at = (a: number): LotPoint | undefined => {
    const p = lotPath(grid, b, k, phase, inlet, a);
    if (!p) return undefined;
    return phase === 'in' ? p[1] : p[p.length - 2];
  };
  const t0 = at(0);
  const t1 = at(1);
  if (!t0 || !t1) return undefined;
  const u = minus(t1, t0);
  const { d, n } = axes(dir);
  const along = dot(u, d);
  let a: number;
  if (Math.abs(along) > 0.5) {
    a = (ahead - dot(minus(t0, lanePt), d)) / along;
  } else {
    const across = dot(u, n);
    a = Math.abs(across) > 1e-9 ? -dot(minus(t0, lanePt), n) / across : 0.5;
  }
  return Math.min(0.8, Math.max(0.2, a));
}

/**
 * The points of a turn from `from` to `to` round `corner`, starting and ending `r` tiles from the corner
 * (less on a shorter leg). Empty when the three points are in line.
 */
function turnRound(
  from: LotPoint,
  corner: LotPoint,
  to: LotPoint,
  r: number,
): LotPoint[] {
  const inLen = Math.hypot(from.x - corner.x, from.y - corner.y);
  const outLen = Math.hypot(to.x - corner.x, to.y - corner.y);
  if (inLen < 1e-6 || outLen < 1e-6) return [];
  const cross =
    (corner.x - from.x) * (to.y - corner.y) -
    (corner.y - from.y) * (to.x - corner.x);
  if (Math.abs(cross) < 1e-9) return [];
  const ri = Math.min(r, inLen);
  const ro = Math.min(r, outLen);
  const a = {
    x: corner.x + ((from.x - corner.x) / inLen) * ri,
    y: corner.y + ((from.y - corner.y) / inLen) * ri,
  };
  const b = {
    x: corner.x + ((to.x - corner.x) / outLen) * ro,
    y: corner.y + ((to.y - corner.y) / outLen) * ro,
  };
  const out: LotPoint[] = [];
  const SAMPLES = 8;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const v = 1 - t;
    out.push({
      x: v * v * a.x + 2 * v * t * corner.x + t * t * b.x,
      y: v * v * a.y + 2 * v * t * corner.y + t * t * b.y,
    });
  }
  return out;
}

/** A path without repeated points. */
function dedupe(points: LotPoint[]): LotPoint[] {
  return points.filter(
    (p, i) =>
      i === 0 ||
      Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-9,
  );
}

/** Whether `other` is a car on its way into the lot at `node`: it has driven onto the node and not yet started (not `car`). */
function waitingNear(other: Car, node: number | undefined, car: Car): boolean {
  return (
    other !== car &&
    other.state === 'driving' &&
    other.lot === undefined &&
    other.entering === true &&
    other.route[other.route.length - 1] === node
  );
}

/** Whether a tile holds one car at a time: a light, or a junction. */
function holdsAlone(state: SimState, tile: number): boolean {
  return (
    state.controls[tile] === 'light' ||
    roadLinks(state.roads, state.links, tile).length >=
      tuning.JUNCTION_MIN_ROADS
  );
}

/**
 * Whether a car at the end of the tile before its destination's node may enter that node now. Only one car
 * at a time may be on the node, and only when its lane is free and a space is left after reserving spaces
 * for the cars already on the way in. A car that has to wait waits on the road, so the node stays clear.
 */
export function lotGateOpen(state: SimState, car: Car): boolean {
  if (car.state !== 'driving' || car.lot !== undefined) return true;
  // The gate is checked when the car drives onto its node, and one tile earlier when that tile is a
  // junction or light, so a car never waits for its lot on a tile that holds other traffic.
  const into = car.progress + 1;
  const last = car.route.length - 1;
  const earlier =
    into === last - 1 && holdsAlone(state, car.route[into] as number);
  if (into !== last && !earlier) return true;
  const node = car.route[last];
  if (node === undefined) return true;
  const building = state.buildings[car.destination];
  if (!building || !hasLotOnMap(state.grid, building)) return true;
  const owner = lotOwnerId(building);
  const inlet = inletOf(state, building, node);
  if (!laneFree(state, owner, inlet)) return false;
  const onNode = state.cars.some((c) => waitingNear(c, node, car));
  if (onNode) return false;
  const count = spacesFor(building.lot ?? 'single').length;
  // Spaces already in use. Cars still on the way in take their space when they reach the node; a car
  // waiting at the lot's edge to leave has given its space up.
  let taken = 0;
  for (const c of state.cars) {
    if (c === car || c.lot === undefined || leftSpace(c)) continue;
    const other = state.buildings[c.destination];
    if (other && lotOwnerId(other) === owner) taken += 1;
  }
  return count - taken > 0;
}

/**
 * Starts a car's drive into its destination's lot. The car stays on the road, waiting at the
 * node, until the lane is free and a space is open. The drive starts on the car's lane of the
 * tile it came from, and turns off its lane into the inlet.
 */
export function startLotTrip(state: SimState, car: Car): LotStart {
  const building = state.buildings[car.destination];
  if (!building || !hasLotOnMap(state.grid, building)) {
    return 'none';
  }
  // A double lot's two buildings share one lane and one set of spaces, so the lot's owner keys them.
  const owner = lotOwnerId(building);
  const inlet = inletOf(state, building, car.route[car.progress]);
  if (!laneFree(state, owner, inlet)) return 'waiting';
  const space = freeSpace(
    state,
    owner,
    spacesFor(building.lot ?? 'single').length,
  );
  if (space === null) return 'waiting';
  const node = car.route[car.progress];
  const prev = car.progress > 0 ? car.route[car.progress - 1] : undefined;
  let path: LotPoint[];
  let s = 0;
  if (node === undefined || prev === undefined) {
    const lane = lotPath(state.grid, building, space, 'in', inlet);
    if (lane === null) return 'none';
    path = roundedPath(lane);
  } else {
    // The car drives on in its lane past the node's centre, turns off the road there, and crosses the
    // lot's edge ahead of where it stopped, so it never swings back against its direction of travel.
    const dir = stepDir(state.grid, prev, node);
    const nodeLane = lanePoint(state.grid, node, dir);
    const tabA = tabFor(
      state.grid,
      building,
      space,
      'in',
      inlet,
      nodeLane,
      dir,
      TURN_RADIUS,
    );
    const lane = lotPath(state.grid, building, space, 'in', inlet, tabA);
    if (lane === null) return 'none';
    const tab = lane[1];
    const { d } = axes(dir);
    const t = dot(minus(tab, nodeLane), d);
    const corner = { x: nodeLane.x + d.x * t, y: nodeLane.y + d.y * t };
    path = dedupe([
      lanePoint(state.grid, prev, dir),
      nodeLane,
      ...turnRound(nodeLane, corner, tab, TURN_RADIUS),
      ...roundedPath(lane.slice(1)),
    ]);
    s = distanceTo(path, nodeLane);
  }
  car.lot = {
    destination: owner,
    space,
    inlet,
    phase: 'in',
    path,
    s,
    length: polylineLength(path),
  };
  return 'started';
}

/**
 * Starts a parked car's drive out of its space, back to the road node. The drive ends in the lane
 * of the first road tile on the way home. Returns false while the lane is in use, and the car
 * keeps waiting in its space.
 */
export function startLotExit(state: SimState, car: Car): boolean {
  const lot = car.lot;
  if (!lot || !laneEmpty(state, lot.destination, lot.inlet)) return false;
  // A car already on the node is on its way in and would be left waiting behind this one, so the exit waits.
  const node = car.route[car.progress];
  if (state.cars.some((c) => waitingNear(c, node, car))) {
    return false;
  }
  lot.phase = 'out';
  lot.s = 0;
  lot.cleared = undefined;
  lot.avoid = undefined;
  planExit(state, car, exitRoute(state, car));
  return true;
}

/**
 * The route home of a car leaving a lot: the quickest, unless it has given up on the way it first meant
 * to leave, as that lane stayed jammed, and then one that leaves the node another way where there is one.
 */
export function exitRoute(state: SimState, car: Car): Car | null {
  const avoid = car.lot?.avoid;
  return avoid === undefined
    ? sendHome(state, car)
    : sendHomeAvoiding(state, car, avoid);
}

/**
 * Plans a leaving car's drive from its space to the road, for its route home `home`. The car leaves by the
 * inlet's centre, waits just inside the lot's edge for a gap, then turns into its lane past the node's
 * centre, facing the way it will drive. Cars driving in cross the edge either side of the centre, ahead of
 * where they stop, so they pass a car waiting to leave. Planned again if its route home changes direction
 * while it waits, from where it has got to.
 */
function planExit(state: SimState, car: Car, home: Car | null): void {
  const lot = car.lot;
  if (!lot) return;
  const building = state.buildings[lot.destination];
  const from = home?.route[0];
  const to = home?.route[1];
  let path: LotPoint[] = [];
  let hold: number | undefined;
  let crosses = false;
  let joinAt = 0;
  if (building && from !== undefined && to !== undefined) {
    const dir = stepDir(state.grid, from, to);
    const end = lanePoint(state.grid, from, dir);
    const tabA = tabFor(
      state.grid,
      building,
      lot.space,
      'out',
      lot.inlet,
      end,
      dir,
      0,
    );
    const lane = lotPath(
      state.grid,
      building,
      lot.space,
      'out',
      lot.inlet,
      tabA,
    );
    if (lane) {
      const body = roundedPath(lane.slice(0, -1));
      const edge = body[body.length - 1];
      const { d, n } = axes(dir);
      const t = dot(minus(edge, end), d);
      const corner = { x: end.x + d.x * t, y: end.y + d.y * t };
      // On a road running past the lot the car turns into its lane a turn's radius past the node's centre,
      // and joins the road there. On a road running away from the lot it drives straight on to the centre.
      const finish =
        t > -0.05
          ? { x: corner.x + d.x * TURN_RADIUS, y: corner.y + d.y * TURN_RADIUS }
          : end;
      joinAt = Math.min(
        0.9,
        Math.max(0, dot(minus(finish, end), d) / NODE_DRAWN),
      );
      path = dedupe([
        ...body,
        ...turnRound(edge, corner, finish, TURN_RADIUS),
        finish,
      ]);
      hold = Math.max(0, polylineLength(body) - HOLD_BACK);
      // The lot is on the far side of the road from the car's lane, so the turn crosses the other lane.
      const centre = centreOf(state.grid, from);
      crosses = dot(minus(edge, centre), n) < 0;
    }
  } else if (building) {
    const lane = lotPath(state.grid, building, lot.space, 'out', lot.inlet);
    if (lane) path = roundedPath(lane);
  }
  lot.path = path;
  lot.length = polylineLength(path);
  lot.hold = hold;
  lot.crosses = crosses;
  lot.joinAt = joinAt;
  lot.toward = to;
  lot.s = Math.min(lot.s, hold ?? lot.length);
}

/**
 * Brings a leaving car's planned turn on to the road up to date with its route home `home`: when the route
 * now leaves the node another way, the turn is planned again. Only before the car has started its turn.
 */
export function replanExit(state: SimState, car: Car, home: Car | null): void {
  const lot = car.lot;
  if (!lot || lot.phase !== 'out' || lot.cleared === true) return;
  if (home?.route[1] === lot.toward) return;
  planExit(state, car, home);
}

/** Moves a car driving in or out of its lot along the lane, by one tick. Parked cars stay put. */
export function advanceLot(car: Car): void {
  const lot = car.lot;
  if (!lot || lot.phase === 'parked') return;
  const step = tuning.CAR_SPEED / tuning.TICKS_PER_SECOND;
  // On the way out the car stops at the lot's edge until the road is clear for it.
  const stop =
    lot.phase === 'out' && lot.cleared !== true
      ? (lot.hold ?? lot.length)
      : lot.length;
  lot.s = Math.min(stop, lot.s + step);
}
