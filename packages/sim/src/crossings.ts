import { onRoadsChanged } from './cars.ts';
import { tuning } from './config.ts';
import { isOpenTile } from './expansion.ts';
import { updateRoadGraph } from './graph.ts';
import {
  addLink,
  type Grid,
  isBuildable,
  isInBounds,
  Terrain,
  type TerrainKind,
} from './grid.ts';
import type { SimState } from './sim.ts';

/**
 * Crossings (spec: Bridges and tunnels). A bridge carries a road over a straight run of
 * water; a tunnel carries one through a straight run of mountain. Each crossing uses one
 * upgrade from stock, and its road tiles cost the budget like any other road. The two ends
 * must be land or park, and the span between them is limited.
 */

export type CrossingKind = 'bridge' | 'tunnel';

export type CrossingReason =
  | 'out-of-bounds'
  | 'not-aligned'
  | 'no-span'
  | 'too-long'
  | 'bad-endpoint'
  | 'bad-terrain'
  | 'locked'
  | 'no-stock'
  | 'no-budget';

export type CrossingResult =
  { ok: true; added: number } | { ok: false; reason: CrossingReason };

const RULES: Record<
  CrossingKind,
  { terrain: TerrainKind; maxSpan: () => number }
> = {
  bridge: { terrain: Terrain.Water, maxSpan: () => tuning.BRIDGE_MAX_SPAN },
  tunnel: { terrain: Terrain.Mountain, maxSpan: () => tuning.TUNNEL_MAX_SPAN },
};

/** The tiles from `from` to `to`, both included, along one row or column. Null when not aligned. */
function straightRun(grid: Grid, from: number, to: number): number[] | null {
  const fx = from % grid.cols;
  const fy = Math.floor(from / grid.cols);
  const tx = to % grid.cols;
  const ty = Math.floor(to / grid.cols);
  if (fx !== tx && fy !== ty) return null;
  const dx = Math.sign(tx - fx);
  const dy = Math.sign(ty - fy);
  const run: number[] = [];
  let x = fx;
  let y = fy;
  for (;;) {
    run.push(y * grid.cols + x);
    if (x === tx && y === ty) break;
    x += dx;
    y += dy;
  }
  return run;
}

/**
 * Builds a crossing of `kind` from tile `from` to tile `to`, along one row or column. The
 * tiles strictly between them must all be the crossing's terrain (water for a bridge,
 * mountain for a tunnel), and there must be between one and the kind's maximum of them.
 * Road is laid and linked along the whole run. All or nothing.
 */
export function placeCrossing(
  state: SimState,
  kind: CrossingKind,
  from: number,
  to: number,
): CrossingResult {
  const fail = (reason: CrossingReason): CrossingResult => ({
    ok: false,
    reason,
  });
  const { grid } = state;
  if (!isInBounds(grid, from) || !isInBounds(grid, to))
    return fail('out-of-bounds');
  const run = straightRun(grid, from, to);
  if (!run) return fail('not-aligned');
  const interior = run.slice(1, -1);
  if (interior.length === 0) return fail('no-span');
  const rule = RULES[kind];
  if (interior.length > rule.maxSpan()) return fail('too-long');
  for (const end of [from, to]) {
    if (!isBuildable(grid, end) || state.buildingAt[end] !== -1) {
      return fail('bad-endpoint');
    }
  }
  for (const i of interior) {
    if (grid.terrain[i] !== rule.terrain || state.buildingAt[i] !== -1) {
      return fail('bad-terrain');
    }
  }
  if (run.some((i) => !isOpenTile(state, i))) return fail('locked');
  if (state.stock[kind] < 1) return fail('no-stock');
  const added = run.filter((i) => state.roads[i] === 0);
  if (added.length > state.budget) return fail('no-budget');

  for (const i of added) state.roads[i] = 1;
  for (let k = 1; k < run.length; k++) addLink(state.links, run[k - 1], run[k]);
  state.budget -= added.length;
  state.stock[kind] -= 1;
  updateRoadGraph(state.graph, grid, state.roads, state.links, run);
  onRoadsChanged(state, run, []);
  return { ok: true, added: added.length };
}
