import type { Car } from './cars.ts';
import {
  CAR_GAP,
  CAR_SPEED,
  JUNCTION_MIN_ROADS,
  TICKS_PER_SECOND,
} from './config.ts';
import { type Grid, neighbors } from './grid.ts';
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
const DISTANCE_PER_TICK = CAR_SPEED / TICKS_PER_SECOND;

/** Lane code for "no direction known". */
const NO_LANE = 9;

function isJunction(state: SimState, tile: number): boolean {
  let roads = 0;
  for (const n of neighbors(state.grid, tile)) {
    if (state.roads[n] === 1) roads += 1;
  }
  return roads >= JUNCTION_MIN_ROADS;
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

/** How far along its current tile the car may move, given the cars ahead of it in its lane. */
function roomAhead(state: SimState, car: Car): number {
  const tile = car.route[car.progress];
  const lane = laneOf(state.grid, car);
  let room = 1;
  for (const d of state.cars) {
    if (d === car || d.route[d.progress] !== tile) continue;
    if (laneOf(state.grid, d) !== lane) continue;
    const ahead =
      d.along > car.along || (d.along === car.along && d.id < car.id);
    if (ahead) room = Math.min(room, d.along - CAR_GAP);
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
  const junction = isJunction(state, tile);
  for (const d of state.cars) {
    if (d === mover || d.route[d.progress] !== tile) continue;
    if (junction) return false;
    if (lane !== null && laneOf(state.grid, d) !== lane) continue;
    if (d.along < CAR_GAP) return false;
  }
  return true;
}

/** Moves one car as far as its budget and the cars around it allow this tick. Parked cars stay put. */
function advance(state: SimState, car: Car): void {
  if (car.state === 'parked') return;
  let budget = DISTANCE_PER_TICK;
  while (budget > EPSILON) {
    const room = roomAhead(state, car);
    if (car.along < room) {
      const step = Math.min(budget, room - car.along);
      car.along += step;
      budget -= step;
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
  for (const car of order) advance(state, car);
}
