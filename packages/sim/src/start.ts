import { tuning } from './config.ts';
import { placeBuilding, type Side } from './buildings.ts';
import { lotAt } from './lots.ts';
import { currentFence, isOpenTile } from './expansion.ts';
import { nextFloat, type RngState } from './rng.ts';
import type { SimState } from './sim.ts';

/**
 * The starting pair (spec: Starting pair): one house and one destination of the same colour,
 * placed at the start of a played map. The house is picked by spawn weight inside the fence, or
 * anywhere in the fence when no weight is set. The destination lies a few tiles away.
 */

const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];
/** Random picks tried before giving up. Each pick tries every entrance side. */
const ATTEMPTS = 400;

/**
 * Places the starting house and destination, or neither. The pair is placed on a copy of the sim
 * and copied back only when both fit, so a failed attempt leaves the map as it was.
 */
export function placeStartingPair(
  state: SimState,
  spawnWeights: readonly number[] | null,
  colour = 0,
): boolean {
  const trial = structuredClone(state);
  const placed = placePair(trial, spawnWeights, colour);
  if (placed) Object.assign(state, trial);
  return placed;
}

function placePair(
  state: SimState,
  spawnWeights: readonly number[] | null,
  colour: number,
): boolean {
  const tiles = tilesInFence(state);
  const house = placeOn(state, tiles, spawnWeights, 'house', colour);
  if (house === null) return false;
  const near = tiles.filter((t) => {
    const d = tileDistance(state, t, house);
    return d >= tuning.START_PAIR_MIN_TILES && d <= tuning.START_PAIR_MAX_TILES;
  });
  const destination = placeOn(
    state,
    near.length > 0 ? near : tiles.filter((t) => t !== house),
    spawnWeights,
    'destination',
    colour,
  );
  return destination !== null;
}

/** Every tile inside the fence now, row by row. */
function tilesInFence(state: SimState): number[] {
  const fence = currentFence(state);
  const out: number[] = [];
  for (let row = fence.row; row < fence.row + fence.rows; row++) {
    for (let col = fence.col; col < fence.col + fence.cols; col++) {
      out.push(row * state.grid.cols + col);
    }
  }
  return out;
}

/** Chebyshev distance between two tiles, in tiles. */
function tileDistance(state: SimState, a: number, b: number): number {
  const cols = state.grid.cols;
  const dc = Math.abs((a % cols) - (b % cols));
  const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
  return Math.max(dc, dr);
}

/** Tries random picks from `candidates` (weighted when any has weight) until a building fits. */
function placeOn(
  state: SimState,
  candidates: number[],
  spawnWeights: readonly number[] | null,
  kind: 'house' | 'destination',
  colour: number,
): number | null {
  if (candidates.length === 0) return null;
  const weights = candidates.map((t) => spawnWeights?.[t] ?? 0);
  const total = weights.reduce((sum, w) => sum + w, 0);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const tile =
      total > 0
        ? weightedPick(candidates, weights, total, state.rng)
        : candidates[Math.floor(nextFloat(state.rng) * candidates.length)];
    for (const side of shuffled(SIDES, state.rng)) {
      if (!fitsInFence(state, kind, tile, side)) continue;
      const result = placeBuilding(state, {
        kind,
        color: colour,
        tile,
        entrance: side,
      });
      if (result.ok) return tile;
    }
  }
  return null;
}

function weightedPick(
  tiles: number[],
  weights: number[],
  total: number,
  rng: RngState,
): number {
  let r = nextFloat(rng) * total;
  for (let i = 0; i < tiles.length; i++) {
    r -= weights[i];
    if (r < 0) return tiles[i];
  }
  return tiles[tiles.length - 1];
}

function shuffled<T>(items: readonly T[], rng: RngState): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(rng) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Whether a building and the road it needs lie wholly inside the fence. A destination's lot is
 * checked tile by tile, so a lot cannot spill past the edge (spec: Starting pair).
 */
function fitsInFence(
  state: SimState,
  kind: 'house' | 'destination',
  tile: number,
  side: Side,
): boolean {
  if (kind === 'house') {
    const next = neighbour(state, tile, side);
    return next !== null && isOpenTile(state, next);
  }
  const lot = lotAt(state.grid, tile, side, 'single', 'near');
  if (!lot) return false;
  return [...lot.tiles, lot.road].every((t) => isOpenTile(state, t));
}

/** The tile next to `tile` on `side`, or null past the grid edge. */
function neighbour(state: SimState, tile: number, side: Side): number | null {
  const cols = state.grid.cols;
  const col = tile % cols;
  const row = Math.floor(tile / cols);
  if (side === 'n') return row > 0 ? tile - cols : null;
  if (side === 's') return row < state.grid.rows - 1 ? tile + cols : null;
  if (side === 'w') return col > 0 ? tile - 1 : null;
  return col < cols - 1 ? tile + 1 : null;
}
