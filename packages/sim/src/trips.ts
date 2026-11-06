import { addCar, dropCar, roadEntrance, sendHome, type Car } from './cars.ts';
import { type Building, isConnected } from './buildings.ts';
import { emitEvent } from './events.ts';
import { tuning } from './config.ts';
import { servePin } from './demand.ts';
import { isOpenTile } from './expansion.ts';
import { houseAcross, houseLeg, joinClear, type Patience } from './movement.ts';
import {
  exitRoute,
  holdingToJoin,
  replanExit,
  startLotExit,
  startLotTrip,
  releaseQueued,
} from './lot-trips.ts';
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
  // Counted once here, and kept up to date as cars are sent, so each house does not rescan every car.
  let driving: Map<number, number> | null = null;
  let open: Building[] | null = null;
  const unclaimed = (id: number): number => {
    if (driving === null) {
      driving = new Map();
      for (const c of state.cars) {
        if (c.state === 'driving')
          driving.set(c.destination, (driving.get(c.destination) ?? 0) + 1);
      }
    }
    const demand = state.demand[id];
    if (!demand) return 0;
    return demand.pins - (driving.get(id) ?? 0);
  };
  for (const b of state.buildings) {
    if (b.kind !== 'house' || !isOpenTile(state, b.tile)) continue;
    const home = state.homes[b.id];
    if (!home || home.atHome === 0) continue;
    home.cooldown = Math.max(0, home.cooldown - 1);
    if (home.cooldown > 0) continue;
    if (!isConnected(state, b)) continue;
    const start = roadEntrance(state, b.id);
    if (start === null) continue;

    // The destinations that could take a car, found once for all houses this tick.
    open ??= state.buildings.filter(
      (d) =>
        d.kind === 'destination' &&
        isOpenTile(state, d.tile) &&
        isConnected(state, d),
    );
    const options = open.filter(
      (d) => d.color === b.color && unclaimed(d.id) > 0,
    );
    if (options.length === 0) continue;
    const pick = options[Math.floor(nextFloat(state.rng) * options.length)];

    const added = addCar(state, b.id, pick.id);
    if (!added.ok) continue;
    const counts = unclaimedCounts(driving, pick.id, 1);
    // The new car pulls out of its house only when its lane, and the other lane if it must cross it, is clear.
    const car = state.cars[state.cars.length - 1] as Car;
    if (!pullOutClear(state, b, car)) {
      state.cars.pop();
      unclaimedCounts(counts, pick.id, -1);
    } else {
      car.along = 0;
      home.atHome -= 1;
      // The wait starts once a car has left. A house whose pull-out was blocked tries again next tick.
      home.cooldown = tuning.SPAWN_INTERVAL_TICKS;
    }
  }
}

/** Adds `delta` to a destination's driving count in `counts`, when the counts have been made. */
function unclaimedCounts(
  counts: Map<number, number> | null,
  destination: number,
  delta: number,
): Map<number, number> | null {
  if (counts !== null) {
    counts.set(destination, (counts.get(destination) ?? 0) + delta);
  }
  return counts;
}

/** How long a car leaving a lot or a kerb waits for traffic about to cross its path before it goes anyway. */
const JOIN_PATIENCE = tuning.TICKS_PER_SECOND * 5;

/** Where a car from a house crosses the other lane: at the access tile's centre, in tiles from its edge. */
const HOUSE_CROSS_AT = 0.5;
/** Where a car leaving a lot crosses the other lane: the inlet's centre, level with the node's centre. */
const LOT_CROSS_AT = 0.5;
/** How far a lot's node is drawn for a car leaving it, from the centre to the exit edge, in tiles. */
const NODE_DRAWN = 0.5;

/** How patient a car waiting to join the road has become, from how long it has waited. */
function patienceOf(car: Car): Patience {
  const waited = car.waited ?? 0;
  if (waited > 2 * JOIN_PATIENCE) return 2;
  return waited > JOIN_PATIENCE ? 1 : 0;
}

/** Whether a new car may pull out of house `b` on to the road: it drives from the house to its lane. */
function pullOutClear(state: SimState, b: Building, car: Car): boolean {
  const tile = car.route[0] as number;
  const to = car.route[1];
  if (to === undefined) return true;
  const step = { from: tile, to };
  // A car crossing the other lane from its house crosses it at the tile's centre.
  return joinClear(
    state,
    tile,
    to,
    car,
    houseAcross(state, b, tile, step) ? HOUSE_CROSS_AT : null,
    houseLeg(state, b, tile, step),
  );
}

/** A car that has driven out of its space joins the road at the lot's node, at `along`, and drives home by `home`. */
function leaveLot(
  state: SimState,
  car: Car,
  along: number,
  home: Car | null,
): void {
  car.lot = undefined;
  car.along = 0;
  car.waited = undefined;
  const next = state.roads[car.route[car.progress]] === 1 ? home : null;
  if (next) {
    // The route was planned while the car was still in its lot, so its copy of the car still has the lot.
    Object.assign(car, next);
    car.lot = undefined;
    car.waited = undefined;
    car.along = along;
  } else {
    dropCar(state, car);
    removeCar(state, car);
  }
}

/**
 * Parks cars that reach their destination, sends parked cars home, and brings home cars in.
 * A destination with a lot takes the car into a free space; the car waits on the road while
 * the lane or every space is taken.
 */
export function updateTrips(state: SimState): void {
  for (const car of [...state.cars]) {
    const lot = car.lot;
    if (lot) {
      if (lot.phase === 'in' && lot.s >= lot.length - EPSILON) {
        lot.phase = 'parked';
        servePin(state, car.destination);
        state.tripsCompleted += 1;
        emitEvent({ kind: 'car-arrived', destination: car.destination });
        car.state = 'parked';
        car.timer = tuning.PARK_TICKS;
      } else if (lot.phase === 'queued') {
        // Waiting in the lot's inbound lane: it turns in once its space, or a deeper one, is free.
        releaseQueued(state, car);
      } else if (lot.phase === 'parked') {
        car.timer -= 1;
        if (car.timer > 0) continue;
        startLotExit(state, car);
      } else if (lot.phase === 'out') {
        // The car waits just inside the lot's edge until the road is clear, then turns on to it.
        if (holdingToJoin(car)) {
          const home = exitRoute(state, car);
          // Its route home may now leave the node another way, as traffic changes: it turns that way.
          replanExit(state, car, home);
          const tile = home?.route[0];
          const to = home?.route[1];
          const clear =
            tile === undefined ||
            to === undefined ||
            joinClear(
              state,
              tile,
              to,
              car,
              lot.crosses === true ? LOT_CROSS_AT : null,
              lot.length - lot.s,
              patienceOf(car),
              (lot.joinAt ?? 0) * NODE_DRAWN,
            );
          if (clear) {
            lot.cleared = true;
          } else {
            car.waited = (car.waited ?? 0) + 1;
            // Its lane has stayed jammed: it leaves the other way instead, if there is one.
            if (car.waited > JOIN_PATIENCE && lot.avoid === undefined) {
              lot.avoid = to;
            }
          }
        }
        if (lot.cleared === true && lot.s >= lot.length - EPSILON) {
          leaveLot(state, car, lot.joinAt ?? 0, exitRoute(state, car));
        }
      }
      continue;
    }
    if (car.state === 'driving' && atRouteEnd(car)) {
      if (startLotTrip(state, car) !== 'none') continue;
      servePin(state, car.destination);
      state.tripsCompleted += 1;
      emitEvent({ kind: 'car-arrived', destination: car.destination });
      car.state = 'parked';
      car.timer = tuning.PARK_TICKS;
    } else if (car.state === 'parked') {
      car.timer -= 1;
      if (car.timer > 0) continue;
      // The car leaves from its destination's entrance edge, so its new route starts at along 0.
      // It waits at the kerb, still parked, until its place on the road is clear.
      const next = sendHome(state, car);
      const tile = next?.route[0];
      const to = next?.route[1];
      const clear =
        tile === undefined ||
        to === undefined ||
        joinClear(state, tile, to, car, null, 0, patienceOf(car));
      if (!clear) {
        car.timer = 1;
        car.waited = (car.waited ?? 0) + 1;
        continue;
      }
      if (next) {
        Object.assign(car, next);
        car.along = 0;
        car.waited = undefined;
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
