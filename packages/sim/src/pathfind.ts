import {
  type Links,
  DIAGONAL_STEP,
  type Grid,
  isDiagonal,
  roadLinks,
} from './grid.ts';

/** True when every step of a route is a link a drag made, and every tile on it is a road. */
export function routeIsLinked(
  roads: readonly number[],
  links: Links,
  route: readonly number[],
): boolean {
  for (let i = 1; i < route.length; i++) {
    if (!roadLinks(roads, links, route[i - 1]).includes(route[i])) return false;
  }
  return route.every((t) => roads[t] === 1);
}

/**
 * A* over road tiles. Roads link through edges and links: a step along an edge costs 1,
 * and a step across a corner costs DIAGONAL_STEP. The octile distance never overestimates,
 * so the first route found is a shortest one. Ties break on the lower tile index, so the
 * same roads always give the same route.
 *
 * Returns the tiles from `from` to `to`, both included, or null when no route exists.
 */
/** Length of a route in tile units: 1 for each edge step, DIAGONAL_STEP for each corner step. */
export function routeLength(grid: Grid, route: readonly number[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += isDiagonal(grid, route[i - 1], route[i]) ? DIAGONAL_STEP : 1;
  }
  return total;
}

export function findRoute(
  grid: Grid,
  roads: readonly number[],
  links: Links,
  from: number,
  to: number,
): number[] | null {
  if (roads[from] !== 1 || roads[to] !== 1) return null;
  if (from === to) return [from];

  const cols = grid.cols;
  const heuristic = (i: number): number => {
    const dx = Math.abs((i % cols) - (to % cols));
    const dy = Math.abs(Math.floor(i / cols) - Math.floor(to / cols));
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
      const step = isDiagonal(grid, current, n) ? DIAGONAL_STEP : 1;
      const next = (cost.get(current) ?? 0) + step;
      if (next < (cost.get(n) ?? Number.POSITIVE_INFINITY)) {
        cost.set(n, next);
        cameFrom.set(n, current);
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  return null;
}
