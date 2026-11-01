import { tuning } from './config.ts';
import { colourUnlocked } from './rules.ts';
import { type Grid, isBuildable, isInBounds } from './grid.ts';
import type { SimState } from './sim.ts';

/**
 * Buildings: houses (where cars start and end) and destinations (where they go).
 * A building occupies one tile. Its entrance faces one side, and it is connected
 * only while the neighbour on that side is a road. Buildings are never removed in M3.
 */

export type Side = 'n' | 'e' | 's' | 'w';
export type BuildingKind = 'house' | 'destination';

export interface Building {
  id: number;
  kind: BuildingKind;
  /** Houses and destinations of the same colour pair up. */
  color: number;
  tile: number;
  entrance: Side;
}

/** A destination's demand. `pins` are waiting requests; one is used up when a car arrives. */
export interface Demand {
  pins: number;
  /** Ticks until the next pin appears. */
  cooldown: number;
  /** Ticks left before this destination ends the game. 0 when it is not overflowing. */
  overflow: number;
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

export interface PlaceBuildingOptions {
  kind: BuildingKind;
  color: number;
  tile: number;
  entrance: Side;
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

/** True when the building's entrance faces a road tile. */
export function isConnected(state: SimState, b: Building): boolean {
  const e = entranceTile(state.grid, b.tile, b.entrance);
  return e !== null && state.roads[e] === 1;
}

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
  if (!isBuildable(state.grid, opts.tile)) {
    return { ok: false, reason: 'unbuildable' };
  }
  if (state.roads[opts.tile] === 1 || state.buildingAt[opts.tile] !== -1) {
    return { ok: false, reason: 'occupied' };
  }
  const id = state.buildings.length;
  state.buildings.push({ id, ...opts });
  state.buildingAt[opts.tile] = id;
  if (opts.kind === 'house') {
    state.homes[id] = {
      owned: tuning.CARS_PER_HOUSE,
      atHome: tuning.CARS_PER_HOUSE,
      cooldown: 0,
    };
  } else {
    state.demand[id] = {
      pins: 0,
      cooldown: tuning.DEMAND_INTERVAL_TICKS,
      overflow: 0,
      growth: 0,
    };
  }
  return { ok: true, id };
}
