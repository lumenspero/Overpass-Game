import { onRoadsChanged } from './cars.ts';
import { tuning } from './config.ts';
import { isOpenTile } from './expansion.ts';
import { updateRoadGraph } from './graph.ts';
import {
  addLink,
  isAdjacent,
  isInBounds,
  Terrain,
  type TerrainKind,
} from './grid.ts';
import type { SimState } from './sim.ts';

/**
 * Crossings (spec: Bridges and tunnels). A bridge is a road dragged across water; a tunnel
 * is a road dragged through mountain. Each run of new crossing tiles along the path is one
 * crossing and uses one bridge or tunnel from stock. A run may be at most the kind's span
 * limit. Road tiles cost the budget like any road. The path must start and end on land,
 * park, or road, and it may pass over land and roads freely.
 */

export type CrossingKind = 'bridge' | 'tunnel';

export type CrossingReason =
  | 'out-of-bounds'
  | 'no-span'
  | 'not-a-path'
  | 'bad-endpoint'
  | 'blocked'
  | 'locked'
  | 'too-long'
  | 'no-stock'
  | 'no-budget';

/** A crossing still standing: its kind and how many of its tiles remain. */
export interface CrossingRun {
  kind: CrossingKind;
  tiles: number;
}

/** Which run an erased tile belonged to, so an undo can put it back. */
export interface CrossingTileRecord {
  id: number;
  kind: CrossingKind;
}

export type CrossingResult =
  | { ok: true; added: number; crossings: number }
  | { ok: false; reason: CrossingReason };

const RULES: Record<
  CrossingKind,
  { terrain: TerrainKind; maxSpan: () => number }
> = {
  bridge: { terrain: Terrain.Water, maxSpan: () => tuning.BRIDGE_MAX_SPAN },
  tunnel: { terrain: Terrain.Mountain, maxSpan: () => tuning.TUNNEL_MAX_SPAN },
};

/**
 * Builds a crossing of `kind` along `tiles`, a path in drag order where each tile touches the
 * one before it. Every tile of the path that is not already road becomes road and is linked
 * to its neighbours. All or nothing.
 */
export function placeCrossing(
  state: SimState,
  kind: CrossingKind,
  tiles: number[],
): CrossingResult {
  const fail = (reason: CrossingReason): CrossingResult => ({
    ok: false,
    reason,
  });
  const { grid } = state;
  if (tiles.length === 0) return fail('not-a-path');
  if (tiles.length < 2) return fail('no-span');
  if (new Set(tiles).size !== tiles.length) return fail('not-a-path');
  for (const i of tiles) {
    if (!isInBounds(grid, i)) return fail('out-of-bounds');
  }
  for (let k = 1; k < tiles.length; k++) {
    if (!isAdjacent(grid, tiles[k - 1], tiles[k])) return fail('not-a-path');
  }

  const rule = RULES[kind];
  for (const end of [tiles[0], tiles[tiles.length - 1]]) {
    const t = grid.terrain[end];
    const ground = t === Terrain.Land || t === Terrain.Park;
    if (state.buildingAt[end] !== -1 || !(ground || state.roads[end] === 1)) {
      return fail('bad-endpoint');
    }
  }
  for (const i of tiles) {
    if (!isOpenTile(state, i)) return fail('locked');
    const t = grid.terrain[i];
    const passable =
      t === Terrain.Land || t === Terrain.Park || t === rule.terrain;
    if (!passable || state.buildingAt[i] !== -1) return fail('blocked');
  }

  // Count runs of new crossing tiles. Tiles that already carry a road cost nothing and do
  // not start a run, so a drag over an existing bridge is free.
  const groups: number[][] = [];
  let run = 0;
  for (const i of tiles) {
    const isNewCrossing =
      grid.terrain[i] === rule.terrain && state.roads[i] === 0;
    if (!isNewCrossing) {
      run = 0;
      continue;
    }
    run += 1;
    if (run === 1) groups.push([]);
    groups[groups.length - 1].push(i);
    if (run > rule.maxSpan()) return fail('too-long');
  }
  const runs = groups.length;
  if (state.stock[kind] < runs) return fail('no-stock');
  const added = tiles.filter((i) => state.roads[i] === 0);
  if (added.length > state.budget) return fail('no-budget');

  for (const i of added) state.roads[i] = 1;
  for (const group of groups) {
    const id = state.nextCrossingRunId;
    state.nextCrossingRunId += 1;
    state.crossingRuns[id] = { kind, tiles: group.length };
    for (const i of group) state.crossingRunOf[i] = id;
  }
  for (let k = 1; k < tiles.length; k++)
    addLink(state.links, tiles[k - 1], tiles[k]);
  state.budget -= added.length;
  state.stock[kind] -= runs;
  updateRoadGraph(state.graph, grid, state.roads, state.links, tiles);
  onRoadsChanged(state, tiles, []);
  return { ok: true, added: added.length, crossings: runs };
}

/**
 * Takes a tile out of its crossing run as it is erased. When the run's last tile goes, its
 * stock comes back. Returns the run the tile was in, or null if it was not part of a crossing.
 */
export function releaseCrossingTile(
  state: SimState,
  i: number,
): CrossingTileRecord | null {
  const id = state.crossingRunOf[i];
  if (id === 0) return null;
  const run = state.crossingRuns[id];
  state.crossingRunOf[i] = 0;
  run.tiles -= 1;
  if (run.tiles === 0) {
    delete state.crossingRuns[id];
    state.stock[run.kind] += 1;
  }
  return { id, kind: run.kind };
}

/** Undoes releaseCrossingTile: the tile rejoins its run, and the stock is taken back if the run had gone. */
export function restoreCrossingTile(
  state: SimState,
  i: number,
  record: CrossingTileRecord,
): void {
  const run = state.crossingRuns[record.id];
  if (run) {
    run.tiles += 1;
  } else {
    state.crossingRuns[record.id] = { kind: record.kind, tiles: 1 };
    state.stock[record.kind] -= 1;
  }
  state.crossingRunOf[i] = record.id;
}
