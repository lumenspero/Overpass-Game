import {
  PACE_KEYS,
  PACE_LIMITS,
  type PaceKey,
  type SourceMap,
} from '@overpass-game/map-schema';
import type { Pt } from './hit.ts';

/**
 * The map's rules, as the Studio's Rules section edits them: the starting fence, and the map's
 * pace (optional overrides of a few game-wide numbers). Positions are in source tiles, with y
 * running south, so tile c spans [c, c + 1).
 */

/** A starting fence: its top-left tile and its size, in tiles. */
export interface FenceRect {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/** What a fence drag holds: the whole fence to move it, or an edge or corner to resize it. */
export type FenceGrip =
  'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Keeps a fence a whole number of tiles, at least one tile each way, and inside the grid. */
export function clampFence(
  f: FenceRect,
  gridCols: number,
  gridRows: number,
): FenceRect {
  const cols = Math.min(gridCols, Math.max(1, Math.round(f.cols)));
  const rows = Math.min(gridRows, Math.max(1, Math.round(f.rows)));
  return {
    col: Math.min(gridCols - cols, Math.max(0, Math.round(f.col))),
    row: Math.min(gridRows - rows, Math.max(0, Math.round(f.row))),
    cols,
    rows,
  };
}

function sameFence(a: FenceRect, b: FenceRect): boolean {
  return (
    a.col === b.col && a.row === b.row && a.cols === b.cols && a.rows === b.rows
  );
}

/** Sets the starting fence, kept inside the grid. A fence that does not change leaves the map as it was. */
export function setFence(map: SourceMap, f: FenceRect): SourceMap {
  const next = clampFence(f, map.grid.cols, map.grid.rows);
  if (sameFence(next, map.grid.fence)) return map;
  return { ...map, grid: { ...map.grid, fence: next } };
}

/** Centres the starting fence in the grid, keeping its size. */
export function centreFence(map: SourceMap): SourceMap {
  const { cols, rows, fence } = map.grid;
  return setFence(map, {
    ...fence,
    col: Math.floor((cols - fence.cols) / 2),
    row: Math.floor((rows - fence.rows) / 2),
  });
}

/**
 * The part of the fence at a point: an edge or corner within `tol` of its border resizes it, a
 * point inside moves it, and a point outside is not on it.
 */
export function pickFence(f: FenceRect, at: Pt, tol: number): FenceGrip | null {
  const x0 = f.col;
  const x1 = f.col + f.cols;
  const y0 = f.row;
  const y1 = f.row + f.rows;
  if (at.x < x0 - tol || at.x > x1 + tol || at.y < y0 - tol || at.y > y1 + tol)
    return null;
  const ns =
    Math.abs(at.y - y0) <= tol ? 'n' : Math.abs(at.y - y1) <= tol ? 's' : '';
  const ew =
    Math.abs(at.x - x0) <= tol ? 'w' : Math.abs(at.x - x1) <= tol ? 'e' : '';
  const grip = `${ns}${ew}`;
  return grip === '' ? 'move' : (grip as FenceGrip);
}

/**
 * The fence after dragging `grip` from `from` to `to`, worked out from the fence as the drag
 * began. It moves or resizes in whole tiles, never shrinks below one tile, and stays in the grid.
 */
export function dragFence(
  start: FenceRect,
  grip: FenceGrip,
  from: Pt,
  to: Pt,
  gridCols: number,
  gridRows: number,
): FenceRect {
  const dx = Math.round(to.x - from.x);
  const dy = Math.round(to.y - from.y);
  if (grip === 'move') {
    return clampFence(
      { ...start, col: start.col + dx, row: start.row + dy },
      gridCols,
      gridRows,
    );
  }
  let left = start.col;
  let top = start.row;
  let right = start.col + start.cols;
  let bottom = start.row + start.rows;
  if (grip.includes('w')) left = Math.min(right - 1, Math.max(0, left + dx));
  if (grip.includes('e'))
    right = Math.max(left + 1, Math.min(gridCols, right + dx));
  if (grip.includes('n')) top = Math.min(bottom - 1, Math.max(0, top + dy));
  if (grip.includes('s'))
    bottom = Math.max(top + 1, Math.min(gridRows, bottom + dy));
  return { col: left, row: top, cols: right - left, rows: bottom - top };
}

/** The pace settings the map sets. A setting it leaves out, which uses the game's default, is missing. */
export function paceOverrides(
  map: SourceMap,
): Partial<Record<PaceKey, number>> {
  const out: Partial<Record<PaceKey, number>> = {};
  const rule = map.rules.find((r) => r.kind === 'pace');
  if (rule?.kind !== 'pace') return out;
  for (const key of PACE_KEYS) {
    const value = rule[key];
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

/** Writes the map's pace rule from a set of overrides. With none left, the rule is removed. */
function withPace(
  map: SourceMap,
  values: Partial<Record<PaceKey, number>>,
): SourceMap {
  const rules = map.rules.filter((r) => r.kind !== 'pace');
  const rule: { kind: 'pace' } & Partial<Record<PaceKey, number>> = {
    kind: 'pace',
  };
  for (const key of PACE_KEYS) {
    const value = values[key];
    if (value !== undefined) rule[key] = value;
  }
  return {
    ...map,
    rules: Object.keys(rule).length === 1 ? rules : [...rules, rule],
  };
}

/**
 * Sets one pace setting, kept inside its range: counted settings are whole numbers, and demand
 * pace is kept to two decimals. `undefined` returns the setting to the game's default. A change
 * that does nothing leaves the map as it was.
 */
export function setPace(
  map: SourceMap,
  key: PaceKey,
  value: number | undefined,
): SourceMap {
  const current = paceOverrides(map);
  let next: number | undefined;
  if (value !== undefined && Number.isFinite(value)) {
    const { min, max, integer } = PACE_LIMITS[key];
    const rounded = integer ? Math.round(value) : Math.round(value * 100) / 100;
    next = Math.min(max, Math.max(min, rounded));
  }
  if (current[key] === next) return map;
  const values = { ...current };
  if (next === undefined) delete values[key];
  else values[key] = next;
  return withPace(map, values);
}

/** Returns every pace setting to the game's default, by removing the map's pace rule. */
export function clearPace(map: SourceMap): SourceMap {
  if (!map.rules.some((r) => r.kind === 'pace')) return map;
  return { ...map, rules: map.rules.filter((r) => r.kind !== 'pace') };
}
