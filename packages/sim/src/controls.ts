import { tuning } from './config.ts';
import { isOpenTile } from './expansion.ts';
import { type Grid, isBuildable, isInBounds } from './grid.ts';
import { type CurvePoint, tileCentre } from './motorways.ts';
import type { SimState } from './sim.ts';

/**
 * Roundabouts and traffic lights (spec: Roundabouts and lights). Each goes on any open tile
 * that is not a building, mountain or water, and each uses one from stock. A roundabout lets
 * several cars on at once; a light gives one axis green at a time.
 */

export type ControlKind = 'roundabout' | 'light';

/**
 * Where cars drive round a roundabout, as a fraction of a tile from its centre. The ring is
 * the middle of the donut drawn on the tile, so cars keep to its band.
 */
export const ROUNDABOUT_RING_TILES = 0.36;

/**
 * The path a car takes across a roundabout tile: in from the arm it came by, round the ring
 * keeping right (counter-clockwise on screen), and out by the arm it leaves by. Points are in
 * tile units. The first and last points are on the tile's edge where the arms meet it.
 */
export function roundaboutPath(
  grid: Grid,
  prev: number,
  tile: number,
  next: number,
): CurvePoint[] {
  const c = tileCentre(grid, tile);
  const angle = (n: number): number =>
    Math.atan2(
      Math.floor(n / grid.cols) - Math.floor(tile / grid.cols),
      (n % grid.cols) - (tile % grid.cols),
    );
  const entry = angle(prev);
  const exit = angle(next);
  const TAU = 2 * Math.PI;
  // Screen angles fall as the car goes round, so the sweep is the way round from entry to exit.
  const sweep = (((entry - exit) % TAU) + TAU) % TAU;
  const R = ROUNDABOUT_RING_TILES;
  const at = (phi: number, r: number): CurvePoint => ({
    x: c.x + r * Math.cos(phi),
    y: c.y + r * Math.sin(phi),
  });
  const steps = Math.max(2, Math.ceil(sweep * R * 12));
  const out: CurvePoint[] = [at(entry, 0.5)];
  for (let k = 0; k <= steps; k++) {
    out.push(at(entry - (sweep * k) / steps, R));
  }
  out.push(at(exit, 0.5));
  return out;
}

export type ControlReason =
  'out-of-bounds' | 'bad-endpoint' | 'locked' | 'occupied' | 'no-stock';

export type ControlResult = { ok: true } | { ok: false; reason: ControlReason };

/** Places a roundabout or a light on a tile, taking one from stock. */
export function placeControl(
  state: SimState,
  tile: number,
  kind: ControlKind,
): ControlResult {
  const fail = (reason: ControlReason): ControlResult => ({
    ok: false,
    reason,
  });
  if (!isInBounds(state.grid, tile)) return fail('out-of-bounds');
  // Land, park or road only: no mountain, water or building under it.
  if (!isBuildable(state.grid, tile) || state.buildingAt[tile] !== -1) {
    return fail('bad-endpoint');
  }
  if (!isOpenTile(state, tile)) return fail('locked');
  if (state.controls[tile] !== undefined) return fail('occupied');
  if (state.stock[kind] < 1) return fail('no-stock');
  state.controls[tile] = kind;
  state.stock[kind] -= 1;
  return { ok: true };
}

/** Removes the controls on any of these tiles, returning their stock. Returns how many went. */
export function dropControlsAt(
  state: SimState,
  tiles: readonly number[],
): number {
  let removed = 0;
  for (const tile of tiles) {
    const kind = state.controls[tile];
    if (kind === undefined) continue;
    delete state.controls[tile];
    state.stock[kind] += 1;
    removed += 1;
  }
  return removed;
}

/** Which axis has green at this tick: horizontal first, then vertical, each for LIGHT_GREEN_TICKS. */
export function greenIsHorizontal(state: SimState): boolean {
  return Math.floor(state.tick / tuning.LIGHT_GREEN_TICKS) % 2 === 0;
}

/**
 * Whether a car entering in `lane` (a step code from movement.ts) has green.
 * Steps along x are on the horizontal axis, steps along y on the vertical one.
 */
export function laneHasGreen(state: SimState, lane: number): boolean {
  const dx = Math.floor(lane / 3) - 1;
  const horizontal = dx !== 0;
  return greenIsHorizontal(state) === horizontal;
}
