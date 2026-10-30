import { entranceTile } from './buildings.ts';
import { findRoute } from './pathfind.ts';
import type { SimState } from './sim.ts';

/**
 * Cars carry a route of road tiles from where they are to where they are going.
 * In M3 a car is either driving to a destination or returning to its house.
 * Movement along the route is in movement.ts; here routes are only planned and repaired.
 *
 * Rules when roads change (spec: Cars and routing):
 * - A car whose current tile is deleted goes home from its last road tile still on its route.
 * - A car whose route is broken, but whose current tile is still a road, plans a new route
 *   to its goal (its destination, or its house when returning).
 * - A car whose route is broken and has no new route to its goal goes home instead.
 * - A car with no route home vanishes.
 * - A driving car replans when a road is added, and takes the new route only if it is shorter.
 */

export type CarState = 'driving' | 'returning';

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
}

export type AddCarResult =
  | { ok: true; id: number }
  | { ok: false; reason: 'bad-building' | 'not-connected' | 'no-route' };

/** The road tile in front of a building's entrance, or null if there is none. */
function roadEntrance(state: SimState, buildingId: number): number | null {
  const b = state.buildings[buildingId];
  if (!b) return null;
  const e = entranceTile(state.grid, b.tile, b.entrance);
  return e !== null && state.roads[e] === 1 ? e : null;
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
  const end = roadEntrance(state, destination);
  if (start === null || end === null)
    return { ok: false, reason: 'not-connected' };
  const route = findRoute(state.grid, state.roads, start, end);
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
  });
  return { ok: true, id };
}

/** The car's goal tile for its current state. */
function goalOf(state: SimState, car: Car): number | null {
  return roadEntrance(
    state,
    car.state === 'driving' ? car.destination : car.house,
  );
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
  const route = findRoute(state.grid, state.roads, from, home);
  if (!route) return null;
  return { ...car, state: 'returning', route, progress: 0, along };
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
    const here = Math.min(car.progress, car.route.length - 1);
    const onDeleted = state.roads[car.route[here]] !== 1;
    const routeBroken =
      removed.length > 0 && car.route.some((t) => state.roads[t] !== 1);

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
      const fresh =
        goal === null
          ? null
          : findRoute(state.grid, state.roads, current, goal);
      if (fresh) {
        // Only the route ahead matters, so the new route starts at the car's tile.
        const improves = fresh.length < car.route.length - here;
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
  state.cars = survivors;
}
