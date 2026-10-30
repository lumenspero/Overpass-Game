import { tuning } from './config.ts';
import {
  DIAGONAL_STEP,
  type Grid,
  type Links,
  isDiagonal,
  roadLinks,
} from './grid.ts';
import { type Motorway, motorwayBetween } from './motorways.ts';

/**
 * True when every step of a route is a link a drag made, or a motorway between two ramps,
 * and every tile on it is a road.
 */
export function routeIsLinked(
  roads: readonly number[],
  links: Links,
  route: readonly number[],
  motorways: readonly Motorway[] = [],
): boolean {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    if (roadLinks(roads, links, a).includes(b)) continue;
    if (motorwayBetween(motorways, a, b)) continue;
    return false;
  }
  return route.every((t) => roads[t] === 1);
}

/** The cost of one step: 1 along an edge, DIAGONAL_STEP across a corner, and a motorway's time over its curve. */
function stepCost(
  grid: Grid,
  motorways: readonly Motorway[],
  a: number,
  b: number,
): number {
  const m = motorwayBetween(motorways, a, b);
  if (m) return m.length / tuning.MOTORWAY_SPEED;
  return isDiagonal(grid, a, b) ? DIAGONAL_STEP : 1;
}

/** Length of a route in tile units: 1 per edge step, DIAGONAL_STEP per corner step, and a motorway's time over its curve. */
export function routeLength(
  grid: Grid,
  route: readonly number[],
  motorways: readonly Motorway[] = [],
): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += stepCost(grid, motorways, route[i - 1], route[i]);
  }
  return total;
}

/**
 * A* over road tiles. Roads link through edges and links: a step along an edge costs 1,
 * and a step across a corner costs DIAGONAL_STEP. A motorway is a step from one ramp to the
 * other, costing its curve length over MOTORWAY_SPEED. The heuristic never overestimates,
 * so the first route found is a shortest one. Ties break on the lower tile index, so the
 * same roads always give the same route.
 *
 * Returns the tiles from `from` to `to`, both included, or null when no route exists.
 */
export function findRoute(
  grid: Grid,
  roads: readonly number[],
  links: Links,
  from: number,
  to: number,
  motorways: readonly Motorway[] = [],
): number[] | null {
  if (roads[from] !== 1 || roads[to] !== 1) return null;
  if (from === to) return [from];

  const cols = grid.cols;
  const heuristic = (i: number): number => {
    const dx = Math.abs((i % cols) - (to % cols));
    const dy = Math.abs(Math.floor(i / cols) - Math.floor(to / cols));
    // With motorways a step can cover more ground for less cost, so only the longest
    // side of the box, divided by the speed, is a safe lower bound.
    if (motorways.length > 0) {
      return Math.max(dx, dy) / tuning.MOTORWAY_SPEED;
    }
    return Math.max(dx, dy) + (DIAGONAL_STEP - 1) * Math.min(dx, dy);
  };

  const cost = new Map<number, number>([[from, 0]]);
  const cameFrom = new Map<number, number>();
  const open: number[] = [from];
  const closed = new Set<number>();

  while (open.length > 0) {
    let best = 0;
    for (let k = 1; k < open.length; k++) {
      const a = open[k];
      const b = open[best];
      const fa = (cost.get(a) ?? 0) + heuristic(a);
      const fb = (cost.get(b) ?? 0) + heuristic(b);
      if (fa < fb || (fa === fb && a < b)) best = k;
    }
    const current = open.splice(best, 1)[0];
    if (current === to) {
      const route = [to];
      let step = to;
      while (step !== from) {
        step = cameFrom.get(step) as number;
        route.push(step);
      }
      return route.reverse();
    }
    closed.add(current);

    for (const n of roadLinks(roads, links, current)) {
      if (roads[n] !== 1 || closed.has(n)) continue;
      relax(current, n, stepCost(grid, motorways, current, n));
    }
    for (const m of motorways) {
      if (m.a !== current && m.b !== current) continue;
      const n = m.a === current ? m.b : m.a;
      if (roads[n] !== 1 || closed.has(n)) continue;
      relax(current, n, stepCost(grid, motorways, current, n));
    }

    function relax(from: number, n: number, step: number): void {
      const next = (cost.get(from) ?? 0) + step;
      if (next < (cost.get(n) ?? Number.POSITIVE_INFINITY)) {
        cost.set(n, next);
        cameFrom.set(n, from);
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  return null;
}
