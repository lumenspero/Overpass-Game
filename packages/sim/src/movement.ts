import { accessTile } from './buildings.ts';
import type { Car } from './cars.ts';
import { tuning } from './config.ts';
import { DIAGONAL_STEP, type Grid, isDiagonal, roadLinks } from './grid.ts';
import { laneHasGreen, roundaboutPath } from './controls.ts';
import { motorwayBetween, polylineLength } from './motorways.ts';
import { advanceLot } from './lot-trips.ts';
import type { SimState } from './sim.ts';

/**
 * Car movement along routes (spec: Cars and routing, Movement and queuing).
 *
 * Roads are two lanes, and cars keep to the right. A car's lane is the direction it
 * is travelling in on its current tile, so cars going the same way share a lane and
 * opposite traffic never blocks it. A car's `along` is how far it has moved into its tile.
 * - A car stops `CAR_GAP` short of the car ahead of it in its lane.
 * - A car may enter a tile only when no car in its lane there is closer than `CAR_GAP`
 *   to the entrance.
 * - A junction holds one car at a time, whatever the lane. A car already on it blocks everyone.
 * - Cars move front-first, so a follower sees where its leader has got to this tick.
 */

const EPSILON = 1e-9;

/** Lane code for "no direction known". */
const NO_LANE = 9;

/** Whether a tile is where a destination's lot meets the road. */
function isLotNode(state: SimState, tile: number): boolean {
  return state.buildings.some(
    (b) => b.kind === 'destination' && accessTile(state.grid, b) === tile,
  );
}

function isJunction(state: SimState, tile: number): boolean {
  return (
    roadLinks(state.roads, state.links, tile).length >=
    tuning.JUNCTION_MIN_ROADS
  );
}

/** A small code for the direction of a step between two adjacent tiles. */
function stepCode(grid: Grid, from: number, to: number): number {
  const dx = Math.sign((to % grid.cols) - (from % grid.cols));
  const dy = Math.sign(
    Math.floor(to / grid.cols) - Math.floor(from / grid.cols),
  );
  return (dx + 1) * 3 + (dy + 1);
}

/**
 * The lane a car is in on its current tile: the direction it came in by. A car on its
 * first tile, with no tile behind it, uses the direction it will leave by.
 */
export function laneOf(grid: Grid, car: Car): number {
  const { route, progress } = car;
  if (progress > 0) return stepCode(grid, route[progress - 1], route[progress]);
  if (progress < route.length - 1)
    return stepCode(grid, route[progress], route[progress + 1]);
  return NO_LANE;
}

/** The budget a step costs: a motorway's curve over MOTORWAY_SPEED, or 1 for a ground step (DIAGONAL_STEP across a corner). */
function stepLength(state: SimState, a: number, b: number): number {
  const m = motorwayBetween(state.motorways, a, b);
  if (m) return m.length / tuning.MOTORWAY_SPEED;
  return isDiagonal(state.grid, a, b) ? DIAGONAL_STEP : 1;
}

/**
 * Length of the step the car is on, in budget units: the step out of its tile, or into it on
 * the last tile. On the last tile a motorway arrival costs 1, since the ride was paid on the
 * tile before it.
 *
 * A tile reached by motorway is drawn only from its centre to its exit edge, half a tile, so
 * its step out costs half a ground step. That keeps the car's drawn speed even across the ramp.
 */
function segmentLength(state: SimState, car: Car): number {
  const { route, progress } = car;
  // A destination's lot node is drawn over half a tile on its road side, so its steps cost half.
  if (progress === 0 && route.length > 1 && isLotNode(state, route[0])) {
    return 0.5;
  }
  if (progress < route.length - 1) {
    if (progress > 0 && state.controls[route[progress]] === 'roundabout') {
      // Across a roundabout the car drives round the ring, so its step costs that path.
      return polylineLength(
        roundaboutPath(
          state.grid,
          route[progress - 1],
          route[progress],
          route[progress + 1],
        ),
      );
    }
    const a = route[progress];
    const b = route[progress + 1];
    const arrivedByMotorway =
      progress > 0 &&
      motorwayBetween(state.motorways, route[progress - 1], a) !== null;
    const leavesByMotorway = motorwayBetween(state.motorways, a, b) !== null;
    // The curve already reaches this tile's exit edge, so the tile is passed at once.
    if (arrivedByMotorway && !leavesByMotorway) return 0;
    return stepLength(state, a, b);
  }
  if (progress > 0) {
    const a = route[progress - 1];
    const b = route[progress];
    if (isLotNode(state, b)) return 0.5;
    return motorwayBetween(state.motorways, a, b) ? 1 : stepLength(state, a, b);
  }
  return 1;
}

/** How far along its current tile the car may move, given the cars ahead of it in its lane. */
function roomAhead(state: SimState, car: Car): number {
  const tile = car.route[car.progress];
  const lane = laneOf(state.grid, car);
  let room = 1;
  for (const d of state.cars) {
    if (d === car || d.lot !== undefined || d.route[d.progress] !== tile)
      continue;
    if (laneOf(state.grid, d) !== lane) continue;
    const ahead =
      d.along > car.along || (d.along === car.along && d.id < car.id);
    if (ahead) room = Math.min(room, d.along - tuning.CAR_GAP);
  }
  return Math.max(0, room);
}

/**
 * Whether `tile` can take a car arriving in `lane` now. `mover` is the car asking, which
 * is ignored when counting cars already there. A `lane` of null means any lane, which is
 * used for a car that has not yet got a direction (a new spawn).
 */
export function tileOpen(
  state: SimState,
  tile: number,
  mover: Car | null,
  lane: number | null,
): boolean {
  const control = state.controls[tile];
  if (control === 'light' && lane !== null && !laneHasGreen(state, lane)) {
    return false;
  }
  const junction = isJunction(state, tile);
  // A junction or a light holds one car at a time.
  const single = junction || control === 'light';
  let here = 0;
  for (const d of state.cars) {
    if (d === mover || d.lot !== undefined || d.route[d.progress] !== tile)
      continue;
    if (control === 'roundabout') {
      // A roundabout takes any car that has a gap at its entrance, up to its capacity.
      here += 1;
      if (d.along < tuning.CAR_GAP) return false;
      continue;
    }
    if (single) return false;
    if (lane !== null && laneOf(state.grid, d) !== lane) continue;
    if (d.along < tuning.CAR_GAP) return false;
  }
  if (control === 'roundabout' && here >= tuning.ROUNDABOUT_CAPACITY) {
    return false;
  }
  return true;
}

/** Moves one car as far as its budget and the cars around it allow this tick. Parked cars stay put. */
function advance(state: SimState, car: Car): void {
  if (car.state === 'parked') return;
  let budget = tuning.CAR_SPEED / tuning.TICKS_PER_SECOND;
  while (budget > EPSILON) {
    const room = roomAhead(state, car);
    if (car.along < room) {
      const length = segmentLength(state, car);
      const step = Math.min(budget / length, room - car.along);
      car.along += step;
      budget -= step * length;
      continue;
    }
    // At the end of what it may do on this tile.
    const last = car.progress >= car.route.length - 1;
    if (last || room < 1) return;
    const next = car.route[car.progress + 1];
    const lane = stepCode(state.grid, car.route[car.progress], next);
    if (!tileOpen(state, next, car, lane)) return;
    car.progress += 1;
    car.along = 0;
  }
}

/** Moves every car one tick along its route. Deterministic: front cars move first, then by id. */
export function moveCars(state: SimState): void {
  const order = [...state.cars].sort(
    (a, b) => b.progress + b.along - (a.progress + a.along) || a.id - b.id,
  );
  for (const car of order) {
    if (car.lot) advanceLot(car);
    else advance(state, car);
  }
}
