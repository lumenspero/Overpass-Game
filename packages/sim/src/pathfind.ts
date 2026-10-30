import { type Grid, neighbors } from './grid.ts';

/**
 * A* over road tiles, moving between edge-sharing road tiles. Every step costs 1, and
 * the Manhattan distance never overestimates, so the first route found is a shortest one.
 * Ties break on the lower tile index, so the same roads always give the same route.
 *
 * Returns the tiles from `from` to `to`, both included, or null when no route exists.
 */
export function findRoute(
  grid: Grid,
  roads: readonly number[],
  from: number,
  to: number,
): number[] | null {
  if (roads[from] !== 1 || roads[to] !== 1) return null;
  if (from === to) return [from];

  const cols = grid.cols;
  const heuristic = (i: number): number =>
    Math.abs((i % cols) - (to % cols)) +
    Math.abs(Math.floor(i / cols) - Math.floor(to / cols));

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

    const next = (cost.get(current) ?? 0) + 1;
    for (const n of neighbors(grid, current)) {
      if (roads[n] !== 1 || closed.has(n)) continue;
      if (next < (cost.get(n) ?? Number.POSITIVE_INFINITY)) {
        cost.set(n, next);
        cameFrom.set(n, current);
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  return null;
}
