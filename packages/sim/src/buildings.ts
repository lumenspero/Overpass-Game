import { tuning, demandIntervalFor } from './config.ts';
import { colourUnlocked } from './rules.ts';
import { type Grid, isAdjacent, isBuildable, isInBounds } from './grid.ts';
import { isOpenTile } from './expansion.ts';
import { updateRoadGraph } from './graph.ts';
import { emitEvent } from './events.ts';
import type { SimState } from './sim.ts';
import {
  destinationLot,
  lotAt,
  type LotKind,
  type LotReason,
  lotBlocker,
  lotRoads,
  lotAccessTiles,
  reservedLotTiles,
} from './lots.ts';
import { nextFloat } from './rng.ts';

/**
 * Buildings: houses (where cars start and end) and destinations (where they go).
 * A house occupies one tile and keeps a stub: one free road tile beside it, which the player can
 * move to any of its 8 neighbours but never erase (spec: Buildings). A house without a stub (its
 * facing tile could not take one) connects through the tile its entrance faces, as before. A destination is a 3×3 building in a lot (spec: Parking lots
 * and building kinds). Its lot's inlet is its only connection, and its lot is reserved when it
 * spawns. Buildings are never removed in M3.
 */

export type Side = 'n' | 'e' | 's' | 'w';
/** Which half of a double lot a building stands in. */
export type Wing = 'near' | 'far';
export type BuildingKind = 'house' | 'destination';

export interface Building {
  id: number;
  kind: BuildingKind;
  /** Houses and destinations of the same colour pair up. */
  color: number;
  tile: number;
  entrance: Side;
  /** A destination's lot kind. Absent for a single lot. */
  lot?: LotKind;
  /** A destination in a double lot: which half it stands in. Absent for the near half. */
  wing?: Wing;
  /** The near building of a double lot, on a far building. */
  lotOwner?: number;
  /** When a double lot's near building was placed, in ticks. */
  placedTick?: number;
  /** A destination's shape: square is the slower-demand kind, round the faster one. */
  shape?: DestinationShape;
  /**
   * A house's stub: the road tile it connects through. Free, never erased, and movable to any of
   * the house's 8 neighbours. Absent when the house could not take one.
   */
  stub?: number;
  /** True when the stub took over a road that was already there, so moving away leaves that road. */
  stubAdopted?: boolean;
}

/** A destination's demand. `pins` are waiting requests; one is used up when a car arrives. */
export interface Demand {
  pins: number;
  /** Ticks until the next pin appears. */
  cooldown: number;
  /**
   * How full this destination's overflow pin is, from 0 to 1. It starts filling when a request arrives
   * while OVERFLOW_PIN_LIMIT pins already wait, and the game ends when it is full. Absent in runs saved
   * before it existed, which read it as 0.
   */
  overflowFill?: number;
  /** Expansions this destination has grown through. */
  growth: number;
}

/** A house's cars. `owned` counts cars that belong to it; `atHome` of them are parked there. */
export interface Home {
  owned: number;
  atHome: number;
  /** Ticks until the house may send out its next car. */
  cooldown: number;
}

/** A destination's shape: square is slower to demand, round is quicker. */
export type DestinationShape = 'square' | 'round';

export interface PlaceBuildingOptions {
  kind: BuildingKind;
  color: number;
  tile: number;
  entrance: Side;
  /** A destination's lot. `'roll'` chooses a double lot with the week's chance; absent is a single lot. */
  lot?: LotKind | 'roll';
  /** A destination's shape. Absent is round. */
  shape?: DestinationShape;
}

export type PlaceBuildingResult =
  | { ok: true; id: number }
  | {
      ok: false;
      reason: 'out-of-bounds' | 'unbuildable' | 'occupied' | 'bad-color';
    };

/** Tile index on the far side of a side, or null if that falls off the grid. */
export function entranceTile(
  grid: Grid,
  tile: number,
  side: Side,
): number | null {
  const x = tile % grid.cols;
  const y = Math.floor(tile / grid.cols);
  const nx = side === 'e' ? x + 1 : side === 'w' ? x - 1 : x;
  const ny = side === 's' ? y + 1 : side === 'n' ? y - 1 : y;
  if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) return null;
  return ny * grid.cols + nx;
}

/**
 * The road tile a building connects through. A house's is the tile in front of its entrance. A
 * destination's is the road outside its lot's inlet. Null when it falls off the grid.
 */
export function accessTile(grid: Grid, b: Building): number | null {
  if (b.kind === 'destination') return destinationLot(grid, b)?.road ?? null;
  return b.stub ?? entranceTile(grid, b.tile, b.entrance);
}

/** Every road tile a building connects through: a destination's near road, and its far road where it has one. */
export function accessTiles(grid: Grid, b: Building): number[] {
  if (b.kind === 'destination') {
    const lot = destinationLot(grid, b);
    return lot ? lotRoads(lot) : [];
  }
  const e = b.stub ?? entranceTile(grid, b.tile, b.entrance);
  return e === null ? [] : [e];
}

/** Why a house's stub cannot go on a tile. */
export type StubReason =
  'out-of-bounds' | 'not-adjacent' | 'unbuildable' | 'locked' | 'occupied';

/** True when a tile is a house's stub. */
export function isHouseStub(state: SimState, tile: number): boolean {
  return state.buildings.some((b) => b.kind === 'house' && b.stub === tile);
}

/**
 * Why a house on `houseTile` cannot keep its stub on `tile`, or null if it can. The tile must touch
 * the house by an edge or a corner, and be land, park or an existing road, with no building or lot
 * on it. Another house's stub may share it, so neighbouring houses can join the road at one node.
 * `ignoreLock` lets a house placed on land not yet open take its stub there.
 */
export function stubBlocker(
  state: SimState,
  houseTile: number,
  tile: number,
  ignoreLock = false,
): StubReason | null {
  if (!isInBounds(state.grid, tile)) return 'out-of-bounds';
  if (!isAdjacent(state.grid, houseTile, tile)) return 'not-adjacent';
  if (state.buildingAt[tile] !== -1) return 'occupied';
  if (reservedLotTiles(state).has(tile)) return 'occupied';
  if (state.roads[tile] !== 1 && !isBuildable(state.grid, tile)) {
    return 'unbuildable';
  }
  if (!ignoreLock && !isOpenTile(state, tile)) return 'locked';
  return null;
}

/**
 * Puts a house's stub on a tile, free. A tile that is already a road is taken over as it is, and
 * remembered, so moving the stub away later leaves that road. The caller checks `stubBlocker`.
 */
export function attachStub(
  state: SimState,
  house: Building,
  tile: number,
): void {
  house.stub = tile;
  house.stubAdopted = state.roads[tile] === 1;
  if (state.roads[tile] !== 1) {
    state.roads[tile] = 1;
    updateRoadGraph(state.graph, state.grid, state.roads, state.links, [tile]);
  }
}

/**
 * Gives every house without a stub one on the tile its entrance faces, where that tile can take
 * one. For runs saved before houses had stubs.
 */
export function ensureHouseStubs(state: SimState): void {
  for (const b of state.buildings) {
    if (b.kind !== 'house' || b.stub !== undefined) continue;
    const facing = entranceTile(state.grid, b.tile, b.entrance);
    if (facing !== null && stubBlocker(state, b.tile, facing, true) === null) {
      attachStub(state, b, facing);
    }
  }
}

/**
 * A building's centre, in tile units. A house's is its tile's centre. A destination's is the
 * centre of its 3×3 footprint, so it sits in the middle of its building rather than at its origin.
 */
export function buildingCentre(
  grid: Grid,
  b: Building,
): { x: number; y: number } {
  if (b.kind === 'destination') {
    const lot = destinationLot(grid, b);
    if (lot) {
      let sx = 0;
      let sy = 0;
      for (const t of lot.footprint) {
        sx += (t % grid.cols) + 0.5;
        sy += Math.floor(t / grid.cols) + 0.5;
      }
      return { x: sx / lot.footprint.length, y: sy / lot.footprint.length };
    }
  }
  return {
    x: (b.tile % grid.cols) + 0.5,
    y: Math.floor(b.tile / grid.cols) + 0.5,
  };
}

/** True when the building's access tile is a road. */
export function isConnected(state: SimState, b: Building): boolean {
  return accessTiles(state.grid, b).some((e) => state.roads[e] === 1);
}

/** How a refused destination spawn is reported in the placement result. */
const LOT_REFUSAL: Record<
  LotReason,
  'out-of-bounds' | 'unbuildable' | 'occupied'
> = {
  'no-lot': 'out-of-bounds',
  unbuildable: 'unbuildable',
  road: 'occupied',
  occupied: 'occupied',
  reserved: 'occupied',
};

export function placeBuilding(
  state: SimState,
  opts: PlaceBuildingOptions,
): PlaceBuildingResult {
  if (!isInBounds(state.grid, opts.tile)) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  if (
    !Number.isInteger(opts.color) ||
    opts.color < 0 ||
    opts.color >= tuning.BUILDING_COLOR_COUNT ||
    !colourUnlocked(state, opts.color)
  ) {
    return { ok: false, reason: 'bad-color' };
  }
  const lotKind =
    opts.kind === 'destination' ? resolveLotKind(state, opts.lot) : 'single';
  if (opts.kind === 'destination') {
    // A destination takes its whole lot, so every lot tile must be free before it spawns.
    const why = lotBlocker(state, opts.tile, opts.entrance, lotKind);
    if (why) return { ok: false, reason: LOT_REFUSAL[why] };
  } else {
    if (!isBuildable(state.grid, opts.tile)) {
      return { ok: false, reason: 'unbuildable' };
    }
    // A lot's open strip has no building on it, but its tiles are reserved for the lot (spec: Spawning
    // reserves the lot), so a house cannot stand there either, nor on the access road outside its inlet.
    if (
      state.roads[opts.tile] === 1 ||
      state.buildingAt[opts.tile] !== -1 ||
      reservedLotTiles(state).has(opts.tile) ||
      lotAccessTiles(state).has(opts.tile)
    ) {
      return { ok: false, reason: 'occupied' };
    }
  }
  const id = state.buildings.length;
  const record: Building = {
    id,
    kind: opts.kind,
    color: opts.color,
    tile: opts.tile,
    entrance: opts.entrance,
  };
  if (opts.kind === 'destination' && lotKind === 'double')
    record.lot = 'double';
  if (record.lot === 'double') record.placedTick = state.tick;
  if (opts.kind === 'destination') record.shape = opts.shape ?? 'round';
  state.buildings.push(record);
  // A house occupies its tile. A destination occupies its 3×3 footprint; its lot stays reserved.
  const occupied =
    opts.kind === 'destination'
      ? (lotAt(state.grid, opts.tile, opts.entrance, lotKind)?.footprint ?? [
          opts.tile,
        ])
      : [opts.tile];
  for (const t of occupied) state.buildingAt[t] = id;
  if (opts.kind === 'house') {
    // A house comes with its stub on the tile it faces, free. Land not yet open still takes it,
    // so the stub is there, hidden with the house, when the district opens.
    const facing = entranceTile(state.grid, opts.tile, opts.entrance);
    if (
      facing !== null &&
      stubBlocker(state, opts.tile, facing, true) === null
    ) {
      attachStub(state, record, facing);
    }
  }
  const shape: DestinationShape | undefined =
    opts.kind === 'destination' ? (opts.shape ?? 'round') : undefined;
  if (opts.kind === 'house') {
    state.homes[id] = {
      owned: tuning.CARS_PER_HOUSE,
      atHome: tuning.CARS_PER_HOUSE,
      cooldown: 0,
    };
  } else {
    state.demand[id] = {
      pins: 0,
      cooldown: demandIntervalFor(shape),
      overflowFill: 0,
      growth: 0,
    };
  }
  return { ok: true, id };
}

/** The lot kind a destination gets: a roll for `'roll'`, otherwise the kind given (single by default). */
function resolveLotKind(
  state: SimState,
  lot: LotKind | 'roll' | undefined,
): LotKind {
  if (lot !== 'roll') return lot ?? 'single';
  const week = Math.floor(state.tick / tuning.WEEK_TICKS) + 1;
  const chance =
    week >= tuning.DOUBLE_LOT_WEEK
      ? tuning.DOUBLE_LOT_CHANCE_LATE
      : tuning.DOUBLE_LOT_CHANCE_EARLY;
  return nextFloat(state.rng) < chance ? 'double' : 'single';
}

/**
 * Adds the far building to each double lot once the set week arrives (spec: Parking lots). It
 * takes the empty half of the lot. A lot whose half is not clear is tried again the next week.
 */
export function addSecondBuildings(state: SimState): void {
  for (const near of [...state.buildings]) {
    if (near.kind !== 'destination' || near.lot !== 'double') continue;
    if (near.lotOwner !== undefined || near.wing !== undefined) continue;
    const due =
      (near.placedTick ?? 0) +
      tuning.SECOND_BUILDING_DELAY_WEEKS * tuning.WEEK_TICKS;
    if (state.tick < due) continue;
    if (state.buildings.some((b) => b.lotOwner === near.id)) continue;
    const far = lotAt(state.grid, near.tile, near.entrance, 'double', 'far');
    if (!far) continue;
    const clear = far.footprint.every(
      (t) =>
        isBuildable(state.grid, t) &&
        state.roads[t] !== 1 &&
        state.buildingAt[t] === -1,
    );
    if (!clear) continue;
    const id = state.buildings.length;
    state.buildings.push({
      id,
      kind: 'destination',
      color: near.color,
      tile: near.tile,
      entrance: near.entrance,
      lot: 'double',
      wing: 'far',
      lotOwner: near.id,
      shape: near.shape,
    });
    for (const t of far.footprint) state.buildingAt[t] = id;
    state.demand[id] = {
      pins: 0,
      cooldown: demandIntervalFor(near.shape),
      overflowFill: 0,
      growth: state.demand[near.id]?.growth ?? 0,
    };
    emitEvent({ kind: 'building-spawned', building: id });
  }
}

/** The shape a new destination takes in a given week: square early, round from the switch week. */
export function shapeForWeek(week: number): DestinationShape {
  return week < tuning.SHAPE_SWITCH_WEEK ? 'square' : 'round';
}
