import { onRoadsChanged } from './cars.ts';
import { tuning } from './config.ts';
import { isOpenTile } from './expansion.ts';
import { type Grid, isBuildable, isInBounds, roadLinks } from './grid.ts';
import { updateRoadGraph } from './graph.ts';
import { lotAccessTiles } from './lots.ts';
import {
  type CurvePoint,
  curvePoints,
  handlesFromDrag,
  type Motorway,
  polylineLength,
  sampleCurve,
  tileCentre,
} from './motorways.ts';
import type { SimState } from './sim.ts';

/**
 * Placing, nudging and removing motorways (spec: Motorways). Both ramps must be ground road
 * tiles, not next to each other, and not already a ramp. The curve may pass over anything
 * but must stay on the map and within MOTORWAY_MAX_LENGTH. The curve's length in tiles is
 * paid from budget, and the motorway takes one from stock.
 */

export type MotorwayReason =
  | 'out-of-bounds'
  | 'bad-endpoint'
  | 'locked'
  | 'blocked'
  | 'too-long'
  | 'no-stock'
  | 'no-budget'
  | 'bad-handle';

export type MotorwayResult =
  | { ok: true; id: number; length: number; cost: number }
  | { ok: false; reason: MotorwayReason };

export type NudgeResult =
  | { ok: true; length: number; cost: number }
  | { ok: false; reason: MotorwayReason };

/** The budget a curve of this length costs. */
export function motorwayCost(length: number): number {
  return Math.max(1, Math.round(length * tuning.MOTORWAY_COST_PER_TILE));
}

function adjacent(grid: Grid, a: number, b: number): boolean {
  const dx = Math.abs((a % grid.cols) - (b % grid.cols));
  const dy = Math.abs(Math.floor(a / grid.cols) - Math.floor(b / grid.cols));
  return dx <= 1 && dy <= 1;
}

/**
 * The directions a motorway takes at its ramps, from the ground road there. Each ramp has one
 * direction, the way its road runs through the ramp that points most toward the other ramp,
 * so a road that ends at the ramp still lines the motorway up. Null where a ramp has no
 * linked road at all.
 */
function rampDirections(
  state: SimState,
  a: number,
  b: number,
): { aDir: CurvePoint | null; bDir: CurvePoint | null } {
  const { grid } = state;
  const ca = tileCentre(grid, a);
  const cb = tileCentre(grid, b);
  const towardB = { x: cb.x - ca.x, y: cb.y - ca.y };
  const unit = (from: CurvePoint, to: CurvePoint): CurvePoint | null => {
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    return d > 0 ? { x: (to.x - from.x) / d, y: (to.y - from.y) / d } : null;
  };
  const dot = (p: CurvePoint, q: CurvePoint) => p.x * q.x + p.y * q.y;
  /** The road direction through `ramp` that points most toward the other ramp. */
  const along = (ramp: number, centre: CurvePoint): CurvePoint | null => {
    let best: CurvePoint | null = null;
    let bestDot = 0;
    for (const n of roadLinks(state.roads, state.links, ramp)) {
      const near = tileCentre(grid, n);
      for (const dir of [unit(near, centre), unit(centre, near)]) {
        if (dir && dot(dir, towardB) > bestDot) {
          bestDot = dot(dir, towardB);
          best = dir;
        }
      }
    }
    return best;
  };
  return { aDir: along(a, ca), bDir: along(b, cb) };
}

/** The curve between two ramps with these handles, if it stays on the map and within the length limit. */
function shapeOf(
  grid: Grid,
  a: number,
  b: number,
  handles: readonly CurvePoint[],
  aDir: CurvePoint | null,
  bDir: CurvePoint | null,
): { ok: true; length: number } | { ok: false; reason: MotorwayReason } {
  const curve = sampleCurve(
    curvePoints(grid, a, b, handles, aDir, bDir),
    aDir,
    bDir,
  );
  const inside = curve.every(
    (p) => p.x >= 0 && p.y >= 0 && p.x <= grid.cols && p.y <= grid.rows,
  );
  if (!inside) return { ok: false, reason: 'out-of-bounds' };
  const length = polylineLength(curve);
  if (length > tuning.MOTORWAY_MAX_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  return { ok: true, length };
}

/**
 * Places a motorway from ramp `a` to ramp `b`. `drag` is the pointer path from the press to
 * the release, in tile units; its shape sets the curve. All or nothing.
 */
export function placeMotorway(
  state: SimState,
  a: number,
  b: number,
  drag: readonly CurvePoint[],
): MotorwayResult {
  const fail = (reason: MotorwayReason): MotorwayResult => ({
    ok: false,
    reason,
  });
  const { grid } = state;
  if (!isInBounds(grid, a) || !isInBounds(grid, b)) {
    return fail('out-of-bounds');
  }
  if (adjacent(grid, a, b)) return fail('bad-endpoint');
  // A lot's inlet counts as road: an end on its unbuilt access tile lays that tile with the motorway.
  const inlets = lotAccessTiles(state);
  const lay = [...new Set([a, b])].filter(
    (t) => state.roads[t] !== 1 && inlets.has(t),
  );
  for (const t of [a, b]) {
    if (state.roads[t] !== 1 && !lay.includes(t)) return fail('bad-endpoint');
  }
  if (lay.some((t) => !isBuildable(grid, t) || state.buildingAt[t] !== -1)) {
    return fail('bad-endpoint');
  }
  if (!isOpenTile(state, a) || !isOpenTile(state, b)) return fail('locked');
  if (
    state.motorways.some(
      (m) => m.a === a || m.a === b || m.b === a || m.b === b,
    )
  ) {
    return fail('blocked');
  }
  if (state.stock.motorway < 1) return fail('no-stock');

  const handles = handlesFromDrag(drag, tuning.MOTORWAY_MAX_NODES);
  const { aDir, bDir } = rampDirections(state, a, b);
  const shape = shapeOf(grid, a, b, handles, aDir, bDir);
  if (!shape.ok) return fail(shape.reason);
  const cost = motorwayCost(shape.length);
  if (cost + lay.length > state.budget) return fail('no-budget');

  if (lay.length > 0) {
    for (const t of lay) state.roads[t] = 1;
    state.budget -= lay.length;
    updateRoadGraph(state.graph, grid, state.roads, state.links, lay);
  }

  const id = state.nextMotorwayId;
  state.nextMotorwayId += 1;
  state.motorways.push({
    id,
    a,
    b,
    handles,
    length: shape.length,
    cost,
    aDir,
    bDir,
  });
  state.budget -= cost;
  state.stock.motorway -= 1;
  // The ramps are already roads, so only cars deciding a route need to hear about it.
  onRoadsChanged(state, [a, b], []);
  return { ok: true, id, length: shape.length, cost };
}

/**
 * Moves one handle of a motorway. Refused, leaving it unchanged, if the curve leaves the map,
 * gets too long, or the change in cost is more than the budget.
 */
export function nudgeMotorway(
  state: SimState,
  id: number,
  handle: number,
  to: CurvePoint,
): NudgeResult {
  const fail = (reason: MotorwayReason): NudgeResult => ({
    ok: false,
    reason,
  });
  const m = state.motorways.find((x) => x.id === id);
  if (!m || handle < 0 || handle >= m.handles.length) return fail('bad-handle');

  const handles = m.handles.map((p, k) => (k === handle ? { ...to } : p));
  const shape = shapeOf(state.grid, m.a, m.b, handles, m.aDir, m.bDir);
  if (!shape.ok) return fail(shape.reason);
  const cost = motorwayCost(shape.length);
  const change = cost - m.cost;
  if (change > state.budget) return fail('no-budget');

  state.budget -= change;
  m.handles = handles;
  m.length = shape.length;
  m.cost = cost;
  return { ok: true, length: shape.length, cost };
}

/**
 * Removes every motorway whose ramp is one of `tiles`, returning its stock and budget.
 * Returns the motorways removed, so an undo can restore them.
 */
export function dropMotorwaysAt(
  state: SimState,
  tiles: readonly number[],
): Motorway[] {
  const hit = new Set(tiles);
  const dropped = state.motorways.filter((m) => hit.has(m.a) || hit.has(m.b));
  if (dropped.length === 0) return dropped;
  state.motorways = state.motorways.filter((m) => !dropped.includes(m));
  for (const m of dropped) {
    state.budget += m.cost;
    state.stock.motorway += 1;
  }
  return dropped;
}

/** Puts back a motorway an undo has restored, taking its stock and budget again. */
export function restoreMotorway(state: SimState, m: Motorway): void {
  state.motorways.push(m);
  state.budget -= m.cost;
  state.stock.motorway -= 1;
  onRoadsChanged(state, [m.a, m.b], []);
}

/**
 * Removes one motorway by id, returning its stock and budget. Cars on it replan, since their
 * route no longer has the link. Returns the motorway removed, or null if there was none.
 */
export function removeMotorway(state: SimState, id: number): Motorway | null {
  const m = state.motorways.find((x) => x.id === id);
  if (!m) return null;
  state.motorways = state.motorways.filter((x) => x !== m);
  state.budget += m.cost;
  state.stock.motorway += 1;
  onRoadsChanged(state, [], [m.a, m.b]);
  return m;
}

/**
 * Reads each motorway's ramp directions again from the roads at its ramps, so a motorway keeps meeting
 * its road smoothly after the road there is redrawn. The handles and the cost paid stay as they are;
 * the length follows the new curve. A new curve that would leave the map or run too long is not taken.
 */
export function refreshRamps(state: SimState): void {
  const same = (p: CurvePoint | null, q: CurvePoint | null): boolean =>
    p === q ||
    (p !== null &&
      q !== null &&
      Math.abs(p.x - q.x) < 1e-9 &&
      Math.abs(p.y - q.y) < 1e-9);
  for (const m of state.motorways) {
    const { aDir, bDir } = rampDirections(state, m.a, m.b);
    if (same(aDir, m.aDir) && same(bDir, m.bDir)) continue;
    const shape = shapeOf(state.grid, m.a, m.b, m.handles, aDir, bDir);
    if (!shape.ok) continue;
    m.aDir = aDir;
    m.bDir = bDir;
    m.length = shape.length;
  }
}
