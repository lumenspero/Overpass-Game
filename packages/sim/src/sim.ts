import type { Building, Demand, Home } from './buildings.ts';
import { type Car, onRoadsChanged } from './cars.ts';
import { ROAD_BUDGET_START } from './config.ts';
import { generateDemand, updateOverflow } from './demand.ts';
import { buildRoadGraph, type RoadGraph, updateRoadGraph } from './graph.ts';
import { type Grid, isBuildable, isInBounds } from './grid.ts';
import { moveCars } from './movement.ts';
import { createRng, type RngState } from './rng.ts';
import { spawnCars, updateTrips } from './trips.ts';

/** Everything the simulation remembers. Plain data only, so it serializes to JSON. */
export interface SimState {
  tick: number;
  rng: RngState;
  grid: Grid;
  /** One entry per grid tile: 1 if a road is on it, 0 otherwise. */
  roads: number[];
  budget: number;
  graph: RoadGraph;
  buildings: Building[];
  /** One entry per grid tile: the id of the building on it, or -1. */
  buildingAt: number[];
  /** Car bookkeeping for each house, keyed by building id. */
  homes: Record<number, Home>;
  /** Demand bookkeeping for each destination, keyed by building id. */
  demand: Record<number, Demand>;
  cars: Car[];
  nextCarId: number;
  /** Set when a destination's overflow countdown runs out. The game is over and step does nothing. */
  over: GameOver | null;
}

export interface GameOver {
  /** The tick the game ended on. */
  tick: number;
  /** The destination whose countdown ran out. */
  destination: number;
}

export interface CreateSimOptions {
  seed: number;
  grid: Grid;
  roadBudget?: number;
}

export type PlaceResult =
  | { ok: true; added: number }
  | { ok: false; reason: 'out-of-bounds' | 'unbuildable' | 'no-budget' };

export function createSim({
  seed,
  grid,
  roadBudget = ROAD_BUDGET_START,
}: CreateSimOptions): SimState {
  const roads = new Array<number>(grid.cols * grid.rows).fill(0);
  return {
    tick: 0,
    rng: createRng(seed),
    grid,
    roads,
    budget: roadBudget,
    graph: buildRoadGraph(grid, roads),
    buildings: [],
    buildingAt: new Array<number>(grid.cols * grid.rows).fill(-1),
    homes: {},
    demand: {},
    cars: [],
    nextCarId: 0,
    over: null,
  };
}

/**
 * Places roads on the given tiles, all or nothing. Tiles that already have a road
 * are skipped and cost nothing. Each new road tile costs one from the budget.
 */
export function placeRoads(state: SimState, tiles: number[]): PlaceResult {
  const unique = [...new Set(tiles)];
  for (const i of unique) {
    if (!isInBounds(state.grid, i))
      return { ok: false, reason: 'out-of-bounds' };
    if (!isBuildable(state.grid, i) || state.buildingAt[i] !== -1)
      return { ok: false, reason: 'unbuildable' };
  }
  const added = unique.filter((i) => state.roads[i] === 0);
  if (added.length > state.budget) return { ok: false, reason: 'no-budget' };

  for (const i of added) state.roads[i] = 1;
  state.budget -= added.length;
  if (added.length > 0) {
    updateRoadGraph(state.graph, state.grid, state.roads, added);
    onRoadsChanged(state, added, []);
  }
  return { ok: true, added: added.length };
}

/** Removes roads from the given tiles and refunds one budget per tile. Returns the count removed. */
export function removeRoads(state: SimState, tiles: number[]): number {
  const removed = [...new Set(tiles)].filter(
    (i) => isInBounds(state.grid, i) && state.roads[i] === 1,
  );
  for (const i of removed) state.roads[i] = 0;
  state.budget += removed.length;
  if (removed.length > 0) {
    updateRoadGraph(state.graph, state.grid, state.roads, removed);
    onRoadsChanged(state, [], removed);
  }
  return removed.length;
}

/** Advances the simulation by one fixed tick. Systems are added in later milestones. */
export function step(state: SimState): void {
  if (state.over) return;
  state.tick += 1;
  generateDemand(state);
  updateOverflow(state);
  if (state.over) return;
  spawnCars(state);
  moveCars(state);
  updateTrips(state);
}
