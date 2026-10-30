import type { Building, Demand, Home } from './buildings.ts';
import { type Car, onRoadsChanged } from './cars.ts';
import { tuning } from './config.ts';
import { generateDemand, updateOverflow } from './demand.ts';
import { isOpenTile } from './expansion.ts';
import { buildRoadGraph, type RoadGraph, updateRoadGraph } from './graph.ts';
import {
  addLink,
  type Links,
  dropLinksOf,
  type Grid,
  hasLink,
  isBuildable,
  isAdjacent,
  isInBounds,
  removeLink,
} from './grid.ts';
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
  /** Links between road tiles, each made by a step a drag took (spec: Roads). */
  links: Links;
  budget: number;
  graph: RoadGraph;
  buildings: Building[];
  /** One entry per grid tile: the id of the building on it, or -1. */
  buildingAt: number[];
  /** One entry per grid tile: the district it belongs to (spec: Expansion). */
  districtOf: number[];
  /** Car bookkeeping for each house, keyed by building id. */
  homes: Record<number, Home>;
  /** Demand bookkeeping for each destination, keyed by building id. */
  demand: Record<number, Demand>;
  cars: Car[];
  nextCarId: number;
  /** Set when a destination's overflow countdown runs out. The game is over and step does nothing. */
  over: GameOver | null;
  /** Trips finished so far: cars that reached a destination and served a pin. This is the score. */
  tripsCompleted: number;
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
  /** District of each tile. Defaults to district 0 everywhere, so the whole map is open. */
  districts?: number[];
}

export type PlaceResult =
  | { ok: true; added: number }
  | {
      ok: false;
      reason: 'out-of-bounds' | 'unbuildable' | 'locked' | 'no-budget';
    };

export function createSim({
  seed,
  grid,
  roadBudget = tuning.ROAD_BUDGET_START,
  districts,
}: CreateSimOptions): SimState {
  const roads = new Array<number>(grid.cols * grid.rows).fill(0);
  const links: Links = {};
  return {
    tick: 0,
    rng: createRng(seed),
    grid,
    roads,
    links,
    budget: roadBudget,
    graph: buildRoadGraph(roads, links),
    buildings: [],
    buildingAt: new Array<number>(grid.cols * grid.rows).fill(-1),
    districtOf: districts ?? new Array<number>(grid.cols * grid.rows).fill(0),
    homes: {},
    demand: {},
    cars: [],
    nextCarId: 0,
    over: null,
    tripsCompleted: 0,
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
    if (!isOpenTile(state, i)) return { ok: false, reason: 'locked' };
  }
  const added = unique.filter((i) => state.roads[i] === 0);
  if (added.length > state.budget) return { ok: false, reason: 'no-budget' };

  for (const i of added) state.roads[i] = 1;
  state.budget -= added.length;
  if (added.length > 0) {
    updateRoadGraph(state.graph, state.grid, state.roads, state.links, added);
    onRoadsChanged(state, added, []);
  }
  return { ok: true, added: added.length };
}

/** Removes roads from the given tiles and refunds one budget per tile. Returns the count removed. */
export function removeRoads(state: SimState, tiles: number[]): number {
  const removed = [...new Set(tiles)].filter(
    (i) => isInBounds(state.grid, i) && state.roads[i] === 1,
  );
  for (const i of removed) {
    state.roads[i] = 0;
    dropLinksOf(state.links, i);
  }
  state.budget += removed.length;
  if (removed.length > 0) {
    updateRoadGraph(state.graph, state.grid, state.roads, state.links, removed);
    onRoadsChanged(state, [], removed);
  }
  return removed.length;
}

/**
 * Links two adjacent road tiles, across an edge or a corner. A drag calls this for each
 * step it takes, so the path the player drew is the link: nearby roads never join by
 * themselves. Returns false if the tiles are not both roads, not adjacent, or already linked.
 */
export function linkTiles(state: SimState, a: number, b: number): boolean {
  if (!isInBounds(state.grid, a) || !isInBounds(state.grid, b)) return false;
  if (!isAdjacent(state.grid, a, b)) return false;
  if (state.roads[a] !== 1 || state.roads[b] !== 1) return false;
  if (!addLink(state.links, a, b)) return false;
  updateRoadGraph(state.graph, state.grid, state.roads, state.links, [a, b]);
  onRoadsChanged(state, [a, b], []);
  return true;
}

/** Removes a link. Returns false if the two tiles were not linked. */
export function unlinkTiles(state: SimState, a: number, b: number): boolean {
  if (!hasLink(state.links, a, b)) return false;
  removeLink(state.links, a, b);
  updateRoadGraph(state.graph, state.grid, state.roads, state.links, [a, b]);
  onRoadsChanged(state, [], [a, b]);
  return true;
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
