import { type Car, sendHome } from './cars.ts';
import { tuning } from './config.ts';
import type { Grid } from './grid.ts';
import {
  type LotPoint,
  lotOwnerId,
  lotPath,
  roundedPath,
  spacesFor,
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
export function laneFree(state: SimState, destination: number): boolean {
  return !state.cars.some(
    (c) =>
      c.lot !== undefined &&
      c.lot.destination === destination &&
      c.lot.phase !== 'parked',
  );
}

/** The first parking space of the lot that no car is using, or null when all are full. */
function freeSpace(state: SimState, lot: number, count: number): number | null {
  const taken = new Set<number>();
  for (const c of state.cars) {
    if (c.lot !== undefined && c.lot.destination === lot) {
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

/**
 * Starts a car's drive into its destination's lot. The car stays on the road, waiting at the
 * node, until the lane is free and a space is open. The drive starts on the car's lane of the
 * tile it came from, and turns into the inlet within the lane.
 */
export function startLotTrip(state: SimState, car: Car): LotStart {
  const building = state.buildings[car.destination];
  if (!building || lotPath(state.grid, building, 0, 'in') === null) {
    return 'none';
  }
  // A double lot's two buildings share one lane and one set of spaces, so the lot's owner keys them.
  const owner = lotOwnerId(building);
  if (!laneFree(state, owner)) return 'waiting';
  const space = freeSpace(
    state,
    owner,
    spacesFor(building.lot ?? 'single').length,
  );
  if (space === null) return 'waiting';
  const lane = lotPath(state.grid, building, space, 'in');
  if (lane === null) return 'none';
  const node = car.route[car.progress];
  const prev = car.progress > 0 ? car.route[car.progress - 1] : undefined;
  let path: LotPoint[];
  let s = 0;
  if (node === undefined || prev === undefined) {
    path = roundedPath(lane);
  } else {
    const dir = stepDir(state.grid, prev, node);
    const nodeLane = lanePoint(state.grid, node, dir);
    path = roundedPath([
      lanePoint(state.grid, prev, dir),
      nodeLane,
      ...lane.slice(1),
    ]);
    s = distanceTo(path, nodeLane);
  }
  car.lot = {
    destination: owner,
    space,
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
  if (!lot || !laneFree(state, lot.destination)) return false;
  const building = state.buildings[lot.destination];
  const lane = building
    ? lotPath(state.grid, building, lot.space, 'out')
    : null;
  let path: LotPoint[] = [];
  if (lane) {
    const home = sendHome(state, car);
    const from = home?.route[0];
    const to = home?.route[1];
    const end =
      from !== undefined && to !== undefined
        ? lanePoint(state.grid, from, stepDir(state.grid, from, to))
        : lane[lane.length - 1];
    path = roundedPath([...lane.slice(0, -1), end]);
  }
  lot.phase = 'out';
  lot.path = path;
  lot.length = polylineLength(path);
  lot.s = 0;
  return true;
}

/** Moves a car driving in or out of its lot along the lane, by one tick. Parked cars stay put. */
export function advanceLot(car: Car): void {
  const lot = car.lot;
  if (!lot || lot.phase === 'parked') return;
  const step = tuning.CAR_SPEED / tuning.TICKS_PER_SECOND;
  lot.s = Math.min(lot.length, lot.s + step);
}
