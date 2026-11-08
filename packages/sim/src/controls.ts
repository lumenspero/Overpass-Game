import { tuning } from './config.ts';
import { isOpenTile } from './expansion.ts';
import { type Grid, isBuildable, isInBounds } from './grid.ts';
import { reservedLotTiles } from './lots.ts';
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
export const ROUNDABOUT_RING_TILES = 0.75;

/** How far, in tiles from a roundabout's centre, each road arm meets it: the outer edge of the ring. */
export const ROUNDABOUT_ARM_TILES = 1;
/** Angle, in radians, from an arm to the point where the car joins the ring. */
const ROUNDABOUT_JOIN_RAD = 0.5;
/** Length of the curve handles that bend a car onto and off the ring, in tiles. */
const ROUNDABOUT_HANDLE_TILES = 0.15;

/**
 * The path a car takes across a roundabout tile: out to the ring from the arm it came by, round
 * the ring counter-clockwise on screen, and out by the arm it leaves by. Points are in tile
 * units. The first and last points are where the arms meet the ring's outer edge.
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
  // Screen angles fall as the car goes round, and traffic goes counter-clockwise, so the ring
  // is always driven from entry down to exit.
  const sweep = (((entry - exit) % TAU) + TAU) % TAU;
  const R = ROUNDABOUT_RING_TILES;
  // Each arm meets the ring at its neighbour's centre: one tile out on a straight arm, a diagonal's
  // length on a diagonal one, so the road drawn up to that centre runs on into the ring without a jump.
  const armOf = (n: number): number =>
    ROUNDABOUT_ARM_TILES *
    Math.hypot(
      (n % grid.cols) - (tile % grid.cols),
      Math.floor(n / grid.cols) - Math.floor(tile / grid.cols),
    );
  const d = ROUNDABOUT_JOIN_RAD;
  const h = ROUNDABOUT_HANDLE_TILES;
  const at = (phi: number, r: number): CurvePoint => ({
    x: c.x + r * Math.cos(phi),
    y: c.y + r * Math.sin(phi),
  });
  // Heading when driving round the ring at angle phi, counter-clockwise on screen.
  const travel = (phi: number): CurvePoint => ({
    x: Math.sin(phi),
    y: -Math.cos(phi),
  });
  // Heading straight out along the arm at angle phi.
  const outward = (phi: number): CurvePoint => ({
    x: Math.cos(phi),
    y: Math.sin(phi),
  });
  const offset = (p: CurvePoint, v: CurvePoint, k: number): CurvePoint => ({
    x: p.x + v.x * k,
    y: p.y + v.y * k,
  });
  // Each join is a cubic: it leaves the arm heading in along the arm and arrives on the ring
  // heading along the ring, so the car bends smoothly and never cuts into the middle.
  const cubic = (
    p0: CurvePoint,
    p1: CurvePoint,
    p2: CurvePoint,
    p3: CurvePoint,
    n: number,
  ): CurvePoint[] => {
    const out: CurvePoint[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const e = 3 * u * t * t;
      const f = t * t * t;
      out.push({
        x: a * p0.x + b * p1.x + e * p2.x + f * p3.x,
        y: a * p0.y + b * p1.y + e * p2.y + f * p3.y,
      });
    }
    return out;
  };
  const aIn = at(entry, armOf(prev));
  const bIn = at(entry - d, R);
  const bOut = at(exit + d, R);
  const aOut = at(exit, armOf(next));
  const pts: CurvePoint[] = cubic(
    aIn,
    offset(aIn, outward(entry), -h),
    offset(bIn, travel(entry - d), -h),
    bIn,
    12,
  );
  const ringSweep = sweep - 2 * d;
  const ringSteps = Math.max(2, Math.ceil(ringSweep * R * 24));
  for (let k = 1; k < ringSteps; k++) {
    pts.push(at(entry - d - (ringSweep * k) / ringSteps, R));
  }
  pts.push(
    ...cubic(
      bOut,
      offset(bOut, travel(exit + d), h),
      offset(aOut, outward(exit), -h),
      aOut,
      12,
    ),
  );
  return evenlySpaced(pts, pts.length * 2);
}

/**
 * Resamples a polyline at equal distances along it, so a car moves at one speed over the whole
 * path rather than faster where the points are spread out.
 */
function evenlySpaced(points: CurvePoint[], count: number): CurvePoint[] {
  const lengths = [0];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    lengths.push(lengths[k - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lengths[lengths.length - 1];
  const out: CurvePoint[] = [];
  let seg = 1;
  for (let i = 0; i <= count; i++) {
    const target = (total * i) / count;
    while (seg < points.length - 1 && lengths[seg] < target) seg++;
    const span = lengths[seg] - lengths[seg - 1];
    const t = span > 0 ? (target - lengths[seg - 1]) / span : 0;
    const a = points[seg - 1];
    const b = points[seg];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
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
  if (kind === 'roundabout') {
    // The ring reaches the four neighbours of its tile, so each must be open land or road, with no
    // building, lot or other roundabout on it.
    const reserved = reservedLotTiles(state);
    const x = tile % state.grid.cols;
    const y = Math.floor(tile / state.grid.cols);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.grid.cols || ny >= state.grid.rows) {
        return fail('out-of-bounds');
      }
      const n = ny * state.grid.cols + nx;
      if (
        !isBuildable(state.grid, n) ||
        state.buildingAt[n] !== -1 ||
        reserved.has(n)
      ) {
        return fail('bad-endpoint');
      }
      if (!isOpenTile(state, n)) return fail('locked');
      if (state.controls[n] === 'roundabout') return fail('occupied');
    }
  }
  if (state.stock[kind] < 1) return fail('no-stock');
  state.controls[tile] = kind;
  state.stock[kind] -= 1;
  return { ok: true };
}

/** Puts a control back on a tile, taking its stock again. Undo uses this for an erased control. */
export function restoreControl(
  state: SimState,
  tile: number,
  kind: ControlKind,
): void {
  state.controls[tile] = kind;
  state.stock[kind] -= 1;
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
    if (state.lights) delete state.lights[tile];
    state.stock[kind] += 1;
    removed += 1;
  }
  return removed;
}

/** A light's own phase: which axis has green, and the tick that green began. */
export interface LightState {
  horizontal: boolean;
  since: number;
}

/** The light at a tile, made on first use with green on the horizontal axis from now. */
function lightAt(state: SimState, tile: number): LightState {
  state.lights ??= {};
  let light = state.lights[tile];
  if (!light) {
    light = { horizontal: true, since: state.tick };
    state.lights[tile] = light;
  }
  return light;
}

/** Which axis has green at the light on `tile`. A light starts with the horizontal axis. */
export function greenIsHorizontal(state: SimState, tile: number): boolean {
  return state.lights?.[tile]?.horizontal ?? true;
}

/**
 * Whether a car entering the light on `tile` in `lane` (a step code from movement.ts) has green.
 * Steps with any x part are on the horizontal axis, steps along y only on the vertical one.
 */
export function laneHasGreen(
  state: SimState,
  lane: number,
  tile: number,
): boolean {
  const dx = Math.floor(lane / 3) - 1;
  const horizontal = dx !== 0;
  return greenIsHorizontal(state, tile) === horizontal;
}

/**
 * The cars at each light or coming to it within LIGHT_SENSE_TILES, counted by the axis they enter
 * on. Cars in a lot or parked are not on the road.
 */
function lightDemand(
  state: SimState,
): Map<number, { horizontal: number; vertical: number }> {
  const out = new Map<number, { horizontal: number; vertical: number }>();
  for (const [key, kind] of Object.entries(state.controls)) {
    if (kind === 'light') out.set(Number(key), { horizontal: 0, vertical: 0 });
  }
  if (out.size === 0) return out;
  const { cols } = state.grid;
  for (const car of state.cars) {
    if (car.lot !== undefined || car.state === 'parked') continue;
    for (let k = 1; k <= tuning.LIGHT_SENSE_TILES; k++) {
      const tile = car.route[car.progress + k];
      const from = car.route[car.progress + k - 1];
      if (tile === undefined || from === undefined) break;
      const seen = out.get(tile);
      if (!seen) continue;
      if (from % cols !== tile % cols) seen.horizontal += 1;
      else seen.vertical += 1;
      break;
    }
  }
  return out;
}

/**
 * Switches each light by the traffic it sees. Green stays at least LIGHT_MIN_GREEN_TICKS. After that
 * the light switches when cars wait on the red axis and none come on the green one, or when the
 * green has lasted LIGHT_MAX_GREEN_TICKS while cars wait on both. With no one waiting on the red
 * axis it keeps its green.
 */
export function updateLights(state: SimState): void {
  for (const [tile, seen] of lightDemand(state)) {
    const light = lightAt(state, tile);
    const green = state.tick - light.since;
    if (green < tuning.LIGHT_MIN_GREEN_TICKS) continue;
    const mine = light.horizontal ? seen.horizontal : seen.vertical;
    const other = light.horizontal ? seen.vertical : seen.horizontal;
    if (other === 0) continue;
    if (mine === 0 || green >= tuning.LIGHT_MAX_GREEN_TICKS) {
      light.horizontal = !light.horizontal;
      light.since = state.tick;
    }
  }
}
