import type { Car } from './cars.ts';
import {
  CAR_GAP,
  CAR_SPEED,
  JUNCTION_MIN_ROADS,
  TICKS_PER_SECOND,
} from './config.ts';
import { neighbors } from './grid.ts';
import type { SimState } from './sim.ts';

/**
 * Car movement along routes (spec: Cars and routing, Movement and queuing).
 *
 * Each tile is one lane. A car's `along` is how far it has moved into its tile.
 * - A car stops `CAR_GAP` short of the car ahead of it on the same tile.
 * - A car may enter a tile only when no car on it is closer than `CAR_GAP` to the entrance.
 * - A junction holds one car at a time. A car already on it blocks everyone else.
 * - Cars move front-first, so a follower sees where its leader has got to this tick.
 */

const EPSILON = 1e-9;
const DISTANCE_PER_TICK = CAR_SPEED / TICKS_PER_SECOND;

function isJunction(state: SimState, tile: number): boolean {
  let roads = 0;
  for (const n of neighbors(state.grid, tile)) {
    if (state.roads[n] === 1) roads += 1;
  }
  return roads >= JUNCTION_MIN_ROADS;
}

/** How far along its current tile the car may move, given the cars ahead of it on that tile. */
function roomAhead(state: SimState, car: Car): number {
  const tile = car.route[car.progress];
  let room = 1;
  for (const d of state.cars) {
    if (d === car || d.route[d.progress] !== tile) continue;
    const ahead =
      d.along > car.along || (d.along === car.along && d.id < car.id);
    if (ahead) room = Math.min(room, d.along - CAR_GAP);
  }
  return Math.max(0, room);
}

/** Whether a car may move onto `tile` now. */
function canEnter(state: SimState, car: Car, tile: number): boolean {
  const junction = isJunction(state, tile);
  for (const d of state.cars) {
    if (d === car || d.route[d.progress] !== tile) continue;
    if (junction || d.along < CAR_GAP) return false;
  }
  return true;
}

/** Moves one car as far as its budget and the cars around it allow this tick. */
function advance(state: SimState, car: Car): void {
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
    if (!canEnter(state, car, car.route[car.progress + 1])) return;
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
