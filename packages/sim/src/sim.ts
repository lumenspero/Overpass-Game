import { type ControlKind, dropControlsAt } from './controls.ts';
import { emitEvent, type SimEvent, takeEvents } from './events.ts';
import type { CrossingRun } from './crossings.ts';
import { dropMotorwaysAt } from './motorway-placement.ts';
import type { Motorway } from './motorways.ts';
import type { Building, Demand, Home } from './buildings.ts';
import { type Car, onRoadsChanged } from './cars.ts';
import { tuning } from './config.ts';
import { generateDemand, growDestinations, updateOverflow } from './demand.ts';
import { type MapRule, offerCandidates } from './rules.ts';
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
  linkPartners,
} from './grid.ts';
import { moveCars } from './movement.ts';
import {
  addSecondBuildings,
  attachStub,
  isHouseStub,
  type StubReason,
  stubBlocker,
} from './buildings.ts';
import { createRng, type RngState } from './rng.ts';
import { spawnCars, updateTrips } from './trips.ts';
import {
  emptyStock,
  emptyUnlocked,
  grantWeeklyReward,
  type OfferId,
  type Stock,
  type Unlocked,
} from './upgrades.ts';

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
  /** Offers waiting for an answer, oldest first. Each offer is a pair of options. */
  offers: OfferId[][];
  /** Upgrades the player holds, ready to place. */
  stock: Stock;
  /** Upgrades the player has had in stock this run. The dock shows only these, plus road tiles. */
  unlocked: Unlocked;
  /** One entry per grid tile: the id of the crossing run it belongs to, or 0 for none. */
  crossingRunOf: number[];
  /** Crossing runs still standing, by id. A run returns its stock when its last tile goes. */
  crossingRuns: Record<number, CrossingRun>;
  nextCrossingRunId: number;
  /** Motorways placed on the map (spec: Motorways). */
  motorways: Motorway[];
  nextMotorwayId: number;
  /** Roundabouts and traffic lights on junction tiles, by tile (spec: Roundabouts and lights). */
  controls: Record<number, ControlKind>;
  /** The map's rules, from its data (spec: Destination growth and rule hooks). */
  rules: MapRule[];
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
  rules?: MapRule[];
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
  rules = [],
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
    offers: [],
    stock: emptyStock(),
    unlocked: emptyUnlocked(),
    crossingRunOf: new Array<number>(grid.cols * grid.rows).fill(0),
    crossingRuns: {},
    nextCrossingRunId: 1,
    motorways: [],
    nextMotorwayId: 1,
    controls: {},
    rules,
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
    // A tile that already has a road (a bridge or tunnel) is always accepted; it is free.
    if (
      state.roads[i] === 0 &&
      (!isBuildable(state.grid, i) || state.buildingAt[i] !== -1)
    )
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

/**
 * Removes roads from the given tiles and refunds one budget per tile. Returns the count removed. A
 * house's stub is never removed: it is part of the house (spec: Buildings).
 */
export function removeRoads(state: SimState, tiles: number[]): number {
  const removed = [...new Set(tiles)].filter(
    (i) =>
      isInBounds(state.grid, i) &&
      state.roads[i] === 1 &&
      !isHouseStub(state, i),
  );
  for (const i of removed) {
    state.roads[i] = 0;
    dropLinksOf(state.links, i);
  }
  dropMotorwaysAt(state, removed);
  dropControlsAt(state, removed);
  state.budget += removed.length;
  if (removed.length > 0) {
    updateRoadGraph(state.graph, state.grid, state.roads, state.links, removed);
    onRoadsChanged(state, [], removed);
  }
  return removed.length;
}

export type StubResult =
  | { ok: true; moved: boolean }
  | { ok: false; reason: StubReason | 'not-house' };

/**
 * Moves a house's stub to another of its 8 neighbours. The move is free. The old stub goes with
 * the house, with no refund, since it was never paid for. A road the stub had taken over stays
 * while other roads are joined to it; left alone, it is removed and refunded, as an erase would.
 * Moving to the tile it is already on changes nothing.
 */
export function moveHouseStub(
  state: SimState,
  houseId: number,
  tile: number,
): StubResult {
  const house = state.buildings[houseId];
  if (!house || house.kind !== 'house') {
    return { ok: false, reason: 'not-house' };
  }
  if (house.stub === tile) return { ok: true, moved: false };
  const why = stubBlocker(state, house.tile, tile);
  if (why) return { ok: false, reason: why };
  const old = house.stub;
  const oldWasRoad = house.stubAdopted === true;
  attachStub(state, house, tile);
  if (old !== undefined && !oldWasRoad) {
    // removeRoads refunds the tile; take that refund back, since the stub was free.
    const removed = removeRoads(state, [old]);
    state.budget -= removed;
  } else if (old !== undefined && linkPartners(state.links, old).length === 0) {
    // A road the stub took over, left with nothing joined to it, goes too, refunded as an erase.
    removeRoads(state, [old]);
  }
  return { ok: true, moved: true };
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

/**
 * Advances the simulation by one fixed tick. Returns what happened during the tick, such as a new
 * building or the end of the game. Systems are added in later milestones.
 */
export function step(state: SimState): SimEvent[] {
  takeEvents();
  // The clock waits while an offer is open, so the player chooses before play goes on.
  if (state.over || state.offers.length > 0) return [];
  state.tick += 1;
  if (state.tick % tuning.WEEK_TICKS === 0) {
    emitEvent({ kind: 'week-ended', week: state.tick / tuning.WEEK_TICKS });
    grantWeeklyReward(state, offerCandidates(state));
    growDestinations(state);
    addSecondBuildings(state);
  }
  generateDemand(state);
  updateOverflow(state);
  if (state.over) return takeEvents();
  spawnCars(state);
  moveCars(state);
  updateTrips(state);
  return takeEvents();
}
