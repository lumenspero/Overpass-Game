import { accessTiles, accessTile } from './buildings.ts';
import { findRoute, routeCost, routeIsLinked } from './pathfind.ts';
import type { SimState } from './sim.ts';

/** How many cars are waiting to enter each tile: each has reached the end of its tile, with the tile ahead as its next. */
export function waitingCounts(state: SimState): number[] {
  const counts = new Array<number>(state.grid.cols * state.grid.rows).fill(0);
  for (const car of state.cars) {
    if (car.state === 'parked') continue;
    if (car.progress >= car.route.length - 1) continue;
    if (car.along < 1 - 1e-9) continue;
    counts[car.route[car.progress + 1]] += 1;
  }
  return counts;
}

/**
 * Cars carry a route of road tiles from where they are to where they are going.
 * In M3 a car is either driving to a destination or returning to its house.
 * Movement along the route is in movement.ts, and trips (spawning, parking, returning) in
 * trips.ts; here routes are only planned and repaired.
 *
 * Rules when roads change (spec: Cars and routing):
 * - A car whose current tile is deleted goes home from its last road tile still on its route.
 * - A car whose route is broken, but whose current tile is still a road, plans a new route
 *   to its goal (its destination, or its house when returning).
 * - A car whose route is broken and has no new route to its goal goes home instead.
 * - A car with no route home vanishes.
 * - A driving car replans when a road is added, and takes the new route only if it is shorter.
 */

export type CarState = 'driving' | 'parked' | 'returning';

export interface Car {
  id: number;
  house: number;
  destination: number;
  state: CarState;
  /** Road tiles from the car's start to its goal, both included. */
  route: number[];
  /** Index into `route` of the tile the car is on. */
  progress: number;
  /** How far, from 0 to 1, the car has moved into the tile it is on. */
  along: number;
  /** While parked, the ticks left before the car drives home. */
  timer: number;
  /** While the car is in its destination's parking lot, its trip through the lot. Absent on the road. */
  lot?: LotTrip | undefined;
}

/** A car's trip through a destination's lot: in to a space, parked, then out to the road node. */
export interface LotTrip {
  /** The destination whose lot the car is in. */
  destination: number;
  /** Which parking space, counting from 0. */
  space: number;
  /** The inlet the car drives in through, and out by. */
  inlet: 'near' | 'far';
  /** `in` while driving to the space, `parked` in it, `out` while driving back to the node. */
  phase: 'in' | 'parked' | 'out';
  /** Map points (in tiles) of the drive, from the road node to the space, or back. */
  path: { x: number; y: number }[];
  /** Distance, in tiles, driven along `path`. */
  s: number;
  /** Total length of `path`, in tiles. */
  length: number;
}

export type AddCarResult =
  | { ok: true; id: number }
  | { ok: false; reason: 'bad-building' | 'not-connected' | 'no-route' };

/**
 * The road tile a building connects through (in front of a house's entrance, or outside a
 * destination's lot inlet), or null if there is none.
 */
export function roadEntrance(
  state: SimState,
  buildingId: number,
): number | null {
  const b = state.buildings[buildingId];
  if (!b) return null;
  const e = accessTile(state.grid, b);
  return e !== null && state.roads[e] === 1 ? e : null;
}

/** Every road tile a building can be reached through that has a road placed. */
export function roadEntrances(state: SimState, buildingId: number): number[] {
  const b = state.buildings[buildingId];
  if (!b) return [];
  return accessTiles(state.grid, b).filter((e) => state.roads[e] === 1);
}

export function addCar(
  state: SimState,
  house: number,
  destination: number,
): AddCarResult {
  const h = state.buildings[house];
  const d = state.buildings[destination];
  if (!h || h.kind !== 'house' || !d || d.kind !== 'destination') {
    return { ok: false, reason: 'bad-building' };
  }
  const start = roadEntrance(state, house);
  const ends = roadEntrances(state, destination);
  if (start === null || ends.length === 0)
    return { ok: false, reason: 'not-connected' };
  const route = findRoute(
    state.grid,
    state.roads,
    state.links,
    start,
    ends,
    state.motorways,
    waitingCounts(state),
  );
  if (!route) return { ok: false, reason: 'no-route' };

  const id = state.nextCarId;
  state.nextCarId += 1;
  state.cars.push({
    id,
    house,
    destination,
    state: 'driving',
    route,
    progress: 0,
    along: 0,
    timer: 0,
  });
  return { ok: true, id };
}

/** The car's goal tile for its current state. */
function goalOf(state: SimState, car: Car): number[] | null {
  const id = car.state === 'driving' ? car.destination : car.house;
  const goals = roadEntrances(state, id);
  return goals.length > 0 ? goals : null;
}

/**
 * Routes a car from `from` to its house, or returns null when it can't get there.
 * `along` is the car's position within `from`, which is kept when the car stays on its tile.
 */
function routeHome(
  state: SimState,
  car: Car,
  from: number,
  along: number,
): Car | null {
  const home = roadEntrance(state, car.house);
  if (home === null) return null;
  const route = findRoute(
    state.grid,
    state.roads,
    state.links,
    from,
    home,
    state.motorways,
    waitingCounts(state),
  );
  if (!route) return null;
  return { ...car, state: 'returning', route, progress: 0, along };
}

/** A car with no way home is lost, so its house owns one car fewer. */
export function dropCar(state: SimState, car: Car): void {
  const home = state.homes[car.house];
  if (home) home.owned -= 1;
}

/** Plans a route home from the tile the car is on. Null when there is no way home. */
export function sendHome(state: SimState, car: Car): Car | null {
  return routeHome(state, car, car.route[car.progress], car.along);
}

/**
 * Called after roads change, with the tiles that were added and removed. The roads
 * and road graph must already reflect the change.
 */
export function onRoadsChanged(
  state: SimState,
  added: readonly number[],
  removed: readonly number[],
): void {
  const survivors: Car[] = [];
  for (const car of state.cars) {
    if (car.lot) {
      // A car in its lot finishes its trip there; the road is checked when it leaves.
      survivors.push(car);
      continue;
    }
    const here = Math.min(car.progress, car.route.length - 1);
    const onDeleted = state.roads[car.route[here]] !== 1;
    const routeBroken =
      removed.length > 0 &&
      !routeIsLinked(state.roads, state.links, car.route, state.motorways);

    if (onDeleted) {
      // Walk back along the route to the last tile that is still a road.
      let base: number | null = null;
      for (let k = here - 1; k >= 0; k--) {
        if (state.roads[car.route[k]] === 1) {
          base = car.route[k];
          break;
        }
      }
      // The car starts the walk home at the start of the tile it moves onto.
      const next = base === null ? null : routeHome(state, car, base, 0);
      if (next) survivors.push(next);
      continue;
    }

    if (routeBroken || (added.length > 0 && car.state === 'driving')) {
      const current = car.route[here];
      const goal = goalOf(state, car);
      // The queues the car sees, leaving out the car itself: it is one of the cars waiting.
      const waiting = waitingCounts(state);
      if (car.along >= 1 - 1e-9 && here + 1 < car.route.length) {
        waiting[car.route[here + 1]] -= 1;
      }
      const fresh =
        goal === null
          ? null
          : findRoute(
              state.grid,
              state.roads,
              state.links,
              current,
              goal,
              state.motorways,
              waiting,
            );
      if (fresh) {
        // Only the route ahead matters, so the new route starts at the car's tile.
        const improves =
          routeCost(state.grid, fresh, state.motorways, waiting) <
          routeCost(
            state.grid,
            car.route.slice(here),
            state.motorways,
            waiting,
          );
        if (routeBroken || improves) {
          survivors.push({ ...car, route: fresh, progress: 0 });
          continue;
        }
      } else if (routeBroken) {
        const next = routeHome(state, car, current, car.along);
        if (next) survivors.push(next);
        continue;
      }
    }

    survivors.push(car);
  }
  const kept = new Set(survivors.map((c) => c.id));
  for (const car of state.cars) {
    if (!kept.has(car.id)) dropCar(state, car);
  }
  state.cars = survivors;
}
