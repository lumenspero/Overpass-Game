import { addCar, dropCar, roadEntrance, sendHome, type Car } from './cars.ts';
import { isConnected } from './buildings.ts';
import { PARK_TICKS, SPAWN_INTERVAL_TICKS } from './config.ts';
import { servePin, unclaimedPins } from './demand.ts';
import { tileOpen } from './movement.ts';
import { nextFloat } from './rng.ts';
import type { SimState } from './sim.ts';

/**
 * Trips (spec: Cars and routing, Trips). A house sends out one car at a time, to a
 * connected destination of its colour picked at random. The car drives there, parks
 * for PARK_TICKS, then drives home. A car that gets home rejoins its house.
 */

const EPSILON = 1e-9;

/** True when the car has reached the end of its route. */
function atRouteEnd(car: Car): boolean {
  return car.progress >= car.route.length - 1 && car.along >= 1 - EPSILON;
}

function removeCar(state: SimState, car: Car): void {
  state.cars = state.cars.filter((c) => c.id !== car.id);
}

/** Each house with cars at home may send one out when its cooldown has run down. */
export function spawnCars(state: SimState): void {
  for (const b of state.buildings) {
    if (b.kind !== 'house') continue;
    const home = state.homes[b.id];
    if (!home || home.atHome === 0) continue;
    home.cooldown = Math.max(0, home.cooldown - 1);
    if (home.cooldown > 0) continue;
    if (!isConnected(state, b)) continue;
    const start = roadEntrance(state, b.id);
    if (start === null || !tileOpen(state, start, null, null)) continue;

    const options = state.buildings.filter(
      (d) =>
        d.kind === 'destination' &&
        d.color === b.color &&
        isConnected(state, d) &&
        unclaimedPins(state, d.id) > 0,
    );
    if (options.length === 0) continue;
    const pick = options[Math.floor(nextFloat(state.rng) * options.length)];

    home.cooldown = SPAWN_INTERVAL_TICKS;
    if (addCar(state, b.id, pick.id).ok) home.atHome -= 1;
  }
}

/** Parks cars that reach their destination, sends parked cars home, and brings home cars in. */
export function updateTrips(state: SimState): void {
  for (const car of [...state.cars]) {
    if (car.state === 'driving' && atRouteEnd(car)) {
      servePin(state, car.destination);
      car.state = 'parked';
      car.timer = PARK_TICKS;
    } else if (car.state === 'parked') {
      car.timer -= 1;
      if (car.timer > 0) continue;
      const next = sendHome(state, car);
      if (next) {
        Object.assign(car, next);
      } else {
        dropCar(state, car);
        removeCar(state, car);
      }
    } else if (car.state === 'returning' && atRouteEnd(car)) {
      const home = state.homes[car.house];
      if (home) home.atHome += 1;
      removeCar(state, car);
    }
  }
}
