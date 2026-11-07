import { tuning } from './config.ts';
import type { SimState } from './sim.ts';

/**
 * Map expansion (spec: Expansion). Each map starts inside a fence: a rectangle of grid tiles.
 * Every week the fence grows FENCE_STEPS_PER_WEEK steps, spread across the week. Each step adds a
 * column on the east and west sides and one row, on the north on odd steps and the south on even
 * ones, so the fence grows 2 wide and 1 high a step. A step's new edge slides across its strip over
 * FENCE_REVEAL_TICKS. Tiles open once the edge has passed over them. The fence stops at the map
 * edge and never shrinks. Tiles outside it take no roads, and buildings on them are inactive
 * and hidden.
 */

/** A rectangle of grid tiles: `col` and `row` are its top-left tile, `cols` and `rows` its size. */
export interface Fence {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/** The fence edge in grid units, where tile c spans [c, c + 1). Fractional while a step slides. */
export interface FenceEdge {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Growth steps finished by a tick. A step is finished once its edge has finished sliding. */
export function fenceSteps(tick: number): number {
  if (tuning.FENCE_STEPS_PER_WEEK <= 0) return 0;
  const done =
    ((tick - tuning.FENCE_REVEAL_TICKS) * tuning.FENCE_STEPS_PER_WEEK) /
    tuning.WEEK_TICKS;
  return Math.max(0, Math.floor(done));
}

/** The fence after `steps` finished steps, kept inside the grid. */
function fenceAtSteps(state: SimState, steps: number): Fence {
  const { cols, rows } = state.grid;
  const start = state.startFence;
  const left = Math.max(0, start.col - steps);
  const right = Math.min(cols - 1, start.col + start.cols - 1 + steps);
  // Rows alternate: odd steps add one on the north, even steps one on the south.
  const top = Math.max(0, start.row - Math.ceil(steps / 2));
  const bottom = Math.min(
    rows - 1,
    start.row + start.rows - 1 + Math.floor(steps / 2),
  );
  return {
    col: left,
    row: top,
    cols: right - left + 1,
    rows: bottom - top + 1,
  };
}

/** The tile fence at a tick: the tiles the edge has fully passed. */
export function fenceAt(state: SimState, tick: number): Fence {
  return fenceAtSteps(state, fenceSteps(tick));
}

// Tile checks run many times a tick, so the fence is worked out once per tick and kept.
const fenceCache = new WeakMap<SimState, { tick: number; fence: Fence }>();

/** The tile fence now. Cached per state and tick. */
export function currentFence(state: SimState): Fence {
  const hit = fenceCache.get(state);
  if (hit && hit.tick === state.tick) return hit.fence;
  const fence = fenceAt(state, state.tick);
  fenceCache.set(state, { tick: state.tick, fence });
  return fence;
}

/**
 * The fence edge at a tick, in grid units. It slides from the last finished fence to the next
 * one while a step is revealed, so it is the boundary the player sees. Tiles open only when it
 * has passed them, so the edge leads the tile fence by at most one reveal.
 */
export function fenceEdge(state: SimState, tick: number): FenceEdge {
  const done = fenceSteps(tick);
  let f = 0;
  if (tuning.FENCE_STEPS_PER_WEEK > 0) {
    // The step after the finished ones starts at this tick, and slides over its reveal.
    const started =
      ((done + 1) * tuning.WEEK_TICKS) / tuning.FENCE_STEPS_PER_WEEK;
    f = Math.min(1, Math.max(0, (tick - started) / tuning.FENCE_REVEAL_TICKS));
  }
  const from = fenceAtSteps(state, done);
  const to = fenceAtSteps(state, done + 1);
  const mix = (a: number, b: number): number => a + (b - a) * f;
  return {
    left: mix(from.col, to.col),
    top: mix(from.row, to.row),
    right: mix(from.col + from.cols, to.col + to.cols),
    bottom: mix(from.row + from.rows, to.row + to.rows),
  };
}

/** True when a tile is inside the tile fence now. */
export function isOpenTile(state: SimState, tile: number): boolean {
  const fence = currentFence(state);
  const col = tile % state.grid.cols;
  const row = (tile - col) / state.grid.cols;
  return (
    col >= fence.col &&
    col < fence.col + fence.cols &&
    row >= fence.row &&
    row < fence.row + fence.rows
  );
}
