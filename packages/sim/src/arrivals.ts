import { tuning } from './config.ts';
import { nextFloat } from './rng.ts';
import { colourUnlocked } from './rules.ts';
import type { SimState } from './sim.ts';
import { placeInFence } from './start.ts';
import { currentFence, isOpenTile } from './expansion.ts';
import { destinationLot } from './lots.ts';
import { weekOf } from './score.ts';

/**
 * Business arrival and house supply (spec: Business arrival and house supply). From
 * BUSINESS_ARRIVAL_START_WEEK, new businesses arrive inside the fence each week, each in a
 * random colour the map allows, and a colour's houses are topped up with them. Between
 * arrivals, a colour whose houses fall below SUPPLY_RATIO_MIN per business gets houses up to
 * SUPPLY_RATIO_MAX. Nothing happens before the start week, so the opening game is unchanged.
 */

function arrivalsOn(state: SimState): boolean {
  return weekOf(state.tick) >= tuning.BUSINESS_ARRIVAL_START_WEEK;
}

/**
 * The open tiles in the fence where a new house may spawn: within HOUSE_ROAD_REACH tiles of a road, or
 * within HOUSE_BUILDING_REACH tiles of a building (Chebyshev distance). Recomputed for each house, since
 * each one adds a road of its own.
 */
function houseSites(state: SimState): number[] {
  const { cols, rows } = state.grid;
  const near = new Set<number>();
  const mark = (centres: Iterable<number>, reach: number) => {
    for (const t of centres) {
      const x = t % cols;
      const y = Math.floor(t / cols);
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) {
            near.add(ny * cols + nx);
          }
        }
      }
    }
  };
  const roads: number[] = [];
  for (let i = 0; i < state.roads.length; i++) {
    if (state.roads[i] === 1) roads.push(i);
  }
  mark(roads, tuning.HOUSE_ROAD_REACH);
  // A business reaches from every tile of its lot, not only its entrance tile.
  const anchors: number[] = [];
  for (const b of state.buildings) {
    if (b.kind === 'destination') {
      const lot = destinationLot(state.grid, b);
      anchors.push(...(lot ? lot.tiles : [b.tile]));
    } else {
      anchors.push(b.tile);
    }
  }
  mark(anchors, tuning.HOUSE_BUILDING_REACH);
  const fence = currentFence(state);
  const sites: number[] = [];
  for (let row = fence.row; row < fence.row + fence.rows; row++) {
    for (let col = fence.col; col < fence.col + fence.cols; col++) {
      const t = row * cols + col;
      if (near.has(t) && isOpenTile(state, t)) sites.push(t);
    }
  }
  return sites;
}

/** The colours a new business may take at this tick. */
function unlockedColours(state: SimState): number[] {
  const out: number[] = [];
  for (let c = 0; c < tuning.BUILDING_COLOR_COUNT; c++) {
    if (colourUnlocked(state, c)) out.push(c);
  }
  return out;
}

/**
 * Brings this week's businesses. Each takes a random unlocked colour, and houses of that colour
 * are placed with it at once. Returns how many arrived.
 */
export function arriveBusinesses(state: SimState): number {
  if (!arrivalsOn(state)) return 0;
  let arrived = 0;
  for (let i = 0; i < tuning.BUSINESS_ARRIVALS_PER_WEEK; i++) {
    const colours = unlockedColours(state);
    if (colours.length === 0) break;
    const colour = colours[Math.floor(nextFloat(state.rng) * colours.length)];
    if (colour === undefined) break;
    if (placeInFence(state, 'destination', colour) === null) break;
    arrived += 1;
    topUpSupply(state, colour);
  }
  return arrived;
}

/**
 * Tops up houses for one colour, or every colour, whose houses have fallen below the minimum ratio
 * to its businesses. Adds houses only up to the maximum ratio. A colour with no businesses gets no
 * houses. Returns how many houses were added.
 */
export function topUpSupply(state: SimState, only?: number): number {
  if (!arrivalsOn(state)) return 0;
  const colours =
    only !== undefined
      ? [only]
      : Array.from({ length: tuning.BUILDING_COLOR_COUNT }, (_, c) => c);
  let added = 0;
  for (const colour of colours) {
    let businesses = 0;
    let houses = 0;
    for (const b of state.buildings) {
      if (b.color !== colour) continue;
      if (b.kind === 'destination') businesses += 1;
      else houses += 1;
    }
    if (businesses === 0) continue;
    if (houses >= tuning.SUPPLY_RATIO_MIN * businesses) continue;
    for (let n = houses; n < tuning.SUPPLY_RATIO_MAX * businesses; n++) {
      if (placeInFence(state, 'house', colour, houseSites(state)) === null)
        break;
      added += 1;
    }
  }
  return added;
}
