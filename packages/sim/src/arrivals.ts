import { tuning } from './config.ts';
import { nextFloat } from './rng.ts';
import { paceOf, spawnsOff } from './rules.ts';
import { rollLotKind, type DestinationShape } from './buildings.ts';
import type { SimState } from './sim.ts';
import { placeInFence } from './start.ts';
import { currentFence, isOpenTile } from './expansion.ts';
import { destinationLot } from './lots.ts';
import { weekOf } from './score.ts';

/**
 * Business arrival and house supply (spec: Business arrival and house supply). From
 * BUSINESS_ARRIVAL_START_WEEK, new businesses arrive inside the fence at the start of each week, after
 * its reward, each in a random building colour: one a week, and one more every
 * BUSINESS_BONUS_EVERY_WEEKS. They are square until SHAPE_SWITCH_WEEK; from then an arrival may be round,
 * or level up a square business to round instead. Houses come at one or two moments each week, when a
 * colour whose houses are below SUPPLY_RATIO_MIN per business is topped up to SUPPLY_RATIO_MAX.
 */

function arrivalsOn(state: SimState): boolean {
  return (
    !spawnsOff(state) &&
    weekOf(state.tick) >= paceOf(state.rules).arrivalStartWeek
  );
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

/** The colours a new business may take: the first colours, as many as the run's pace allows. */
function allColours(state: SimState): number[] {
  return Array.from({ length: paceOf(state.rules).colours }, (_, c) => c);
}

/**
 * How many businesses arrive in a week: `perWeek` (the game's by default), and more every
 * BUSINESS_BONUS_EVERY_WEEKS.
 */
export function arrivalsInWeek(
  week: number,
  perWeek: number = tuning.BUSINESS_ARRIVALS_PER_WEEK,
): number {
  const every = tuning.BUSINESS_BONUS_EVERY_WEEKS;
  const bonus =
    every > 0 && week % every === 0 ? tuning.BUSINESS_BONUS_ARRIVALS : 0;
  return perWeek + bonus;
}

/** Turns one square business, picked at random, round. Returns false when there is none. */
function levelUp(state: SimState): boolean {
  const squares = state.buildings.filter(
    (b) => b.kind === 'destination' && b.shape === 'square',
  );
  if (squares.length === 0) return false;
  const pick = squares[Math.floor(nextFloat(state.rng) * squares.length)];
  if (!pick) return false;
  pick.shape = 'round';
  return true;
}

/**
 * Brings this week's businesses. Each takes a random unlocked colour. Before SHAPE_SWITCH_WEEK each is
 * square; from then each is a new round business, a level-up of a square one, or a new square one, by
 * ARRIVAL_ROUND_CHANCE and ARRIVAL_LEVEL_UP_CHANCE. Each new business comes with one house of its
 * colour; the rest of its houses come at the week's house moments.
 * Returns how many arrived, level-ups included.
 */
export function arriveBusinesses(state: SimState): number {
  if (!arrivalsOn(state)) return 0;
  const week = weekOf(state.tick);
  let arrived = 0;
  const perWeek = paceOf(state.rules).arrivalsPerWeek;
  for (let i = 0; i < arrivalsInWeek(week, perWeek); i++) {
    let shape: DestinationShape = 'square';
    if (week >= tuning.SHAPE_SWITCH_WEEK) {
      const roll = nextFloat(state.rng);
      if (roll < tuning.ARRIVAL_LEVEL_UP_CHANCE) {
        if (levelUp(state)) {
          arrived += 1;
          continue;
        }
        shape = 'round';
      } else if (
        roll <
        tuning.ARRIVAL_LEVEL_UP_CHANCE + tuning.ARRIVAL_ROUND_CHANCE
      ) {
        shape = 'round';
      }
    }
    const colours = allColours(state);
    if (colours.length === 0) break;
    const colour = colours[Math.floor(nextFloat(state.rng) * colours.length)];
    if (colour === undefined) break;
    // The lot is rolled once for the arrival. A double lot that fits nowhere falls back to a single.
    const lot = rollLotKind(state);
    const placed =
      (lot === 'double' &&
        placeInFence(state, 'destination', colour, undefined, shape, lot) !==
          null) ||
      placeInFence(state, 'destination', colour, undefined, shape) !== null;
    if (!placed) break;
    // A new business comes with one house of its colour, so its first pins can be met at once.
    placeInFence(state, 'house', colour, houseSites(state));
    arrived += 1;
  }
  return arrived;
}

/** A number in [0, 1) fixed by the run's seed, the week and `i`, so house moments need no saved state. */
function weekRandom(seed: number, week: number, i: number): number {
  let h =
    (Math.imul(seed | 0, 0x9e3779b1) ^
      Math.imul(week, 0x85ebca6b) ^
      Math.imul(i + 1, 0xc2b2ae35)) >>>
    0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * The ticks into a week, from 1, when houses are topped up: HOUSE_MOMENTS_MIN to HOUSE_MOMENTS_MAX of them.
 * The first falls in the week's first quarter, so a business arriving at the week's start soon has houses;
 * any others fall in the rest of the week, in even slices.
 */
export function houseMoments(seed: number, week: number): number[] {
  const min = Math.max(1, tuning.HOUSE_MOMENTS_MIN);
  const max = Math.max(min, tuning.HOUSE_MOMENTS_MAX);
  const count = min + Math.floor(weekRandom(seed, week, 0) * (max - min + 1));
  const span = tuning.WEEK_TICKS - 1;
  const first = Math.floor(span / 4);
  const out = [1 + Math.floor(weekRandom(seed, week, 1) * first)];
  const rest = span - first;
  for (let i = 1; i < count; i++) {
    const slice = rest / (count - 1);
    out.push(
      1 + first + Math.floor((i - 1 + weekRandom(seed, week, i + 1)) * slice),
    );
  }
  return out;
}

/** Whether this tick is one of its week's house moments. */
export function houseMomentNow(state: SimState): boolean {
  if (spawnsOff(state)) return false;
  const week = weekOf(state.tick);
  const into = state.tick - (week - 1) * tuning.WEEK_TICKS;
  return houseMoments(state.rng.seed ?? 0, week).includes(into);
}

/**
 * Tops up houses for one colour, or every colour, whose houses have fallen below the minimum ratio
 * to its businesses. Adds houses only up to the maximum ratio. A colour with no businesses gets no
 * houses. Returns how many houses were added.
 */
export function topUpSupply(state: SimState, only?: number): number {
  const colours = only !== undefined ? [only] : allColours(state);
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
