import type { Grid } from './grid.ts';

/**
 * Motorways (spec: Motorways). An elevated link between two ground road tiles. It is not a
 * road tile: it joins the ground network only at its two ramps. Its curve is free, shaped by
 * handles, so it does not follow the grid. This module is pure geometry and lookups; placing,
 * nudging and removing are in motorway-placement.ts.
 */

/** A point in tile units. A tile's centre is at its column + 0.5 and its row + 0.5. */
export interface CurvePoint {
  x: number;
  y: number;
}

export interface Motorway {
  id: number;
  /** The two ramp tiles, both ground road tiles. */
  a: number;
  b: number;
  /** Handles between the ramps, in tile units, ordered from `a` to `b`. */
  handles: CurvePoint[];
  /** Length of the curve in tile units. */
  length: number;
  /** Budget paid for the curve, returned when the motorway is removed. */
  cost: number;
  /**
   * The unit direction the curve travels as it leaves `a` and as it arrives at `b`, taken from
   * the ground road at each ramp, so the curve meets the road smoothly. Null where the ramp has
   * no road to follow.
   */
  aDir: CurvePoint | null;
  bDir: CurvePoint | null;
}

const SAMPLES_PER_SEGMENT = 12;

export function tileCentre(grid: Grid, i: number): CurvePoint {
  return { x: (i % grid.cols) + 0.5, y: Math.floor(i / grid.cols) + 0.5 };
}

/** The motorway between two tiles, in either direction, or null. */
export function motorwayBetween(
  motorways: readonly Motorway[],
  from: number,
  to: number,
): Motorway | null {
  for (const m of motorways) {
    if ((m.a === from && m.b === to) || (m.a === to && m.b === from)) return m;
  }
  return null;
}

/** The motorways that have `tile` as one of their ramps. */
export function motorwaysTouching(
  motorways: readonly Motorway[],
  tile: number,
): Motorway[] {
  return motorways.filter((m) => m.a === tile || m.b === tile);
}

function catmullRom(
  p0: CurvePoint,
  p1: CurvePoint,
  p2: CurvePoint,
  p3: CurvePoint,
  t: number,
): CurvePoint {
  const axis = (a: number, b: number, c: number, d: number): number =>
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t * t +
      (-a + 3 * b - 3 * c + d) * t * t * t);
  return {
    x: axis(p0.x, p1.x, p2.x, p3.x),
    y: axis(p0.y, p1.y, p2.y, p3.y),
  };
}

/**
 * A smooth curve through the points, sampled evenly along each segment. It starts and ends on
 * the first and last points. `startDir` and `endDir`, when given, set the direction of travel
 * at those ends. They work by adding a ghost point beyond each end, which is never sampled.
 */
export function sampleCurve(
  points: readonly CurvePoint[],
  startDir: CurvePoint | null = null,
  endDir: CurvePoint | null = null,
): CurvePoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const n = points.length;
  const first = points[0];
  const second = points[1];
  const last = points[n - 1];
  const beforeLast = points[n - 2];
  const reach = (p: CurvePoint, q: CurvePoint) =>
    Math.hypot(q.x - p.x, q.y - p.y);
  // Catmull-Rom's tangent at an end is half the distance to the ghost point, so the ghost sits
  // twice the segment's length along the wanted direction.
  const ghostStart =
    startDir && reach(first, second) > 0
      ? {
          x: second.x - 2 * reach(first, second) * startDir.x,
          y: second.y - 2 * reach(first, second) * startDir.y,
        }
      : first;
  const ghostEnd =
    endDir && reach(beforeLast, last) > 0
      ? {
          x: beforeLast.x + 2 * reach(beforeLast, last) * endDir.x,
          y: beforeLast.y + 2 * reach(beforeLast, last) * endDir.y,
        }
      : last;
  const ext = [ghostStart, ...points, ghostEnd];
  const out: CurvePoint[] = [{ ...first }];
  for (let s = 0; s < n - 1; s++) {
    for (let k = 1; k <= SAMPLES_PER_SEGMENT; k++) {
      out.push(
        catmullRom(
          ext[s],
          ext[s + 1],
          ext[s + 2],
          ext[s + 3],
          k / SAMPLES_PER_SEGMENT,
        ),
      );
    }
  }
  return out;
}

export function polylineLength(points: readonly CurvePoint[]): number {
  let total = 0;
  for (let k = 1; k < points.length; k++) {
    total += Math.hypot(
      points[k].x - points[k - 1].x,
      points[k].y - points[k - 1].y,
    );
  }
  return total;
}

/** The point the given distance along a polyline, clamped to its ends. */
export function pointAtDistance(
  points: readonly CurvePoint[],
  s: number,
): CurvePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  let left = s;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= d && d > 0) {
      const t = left / d;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= d;
  }
  return { ...points[points.length - 1] };
}

/** How far out from a ramp's centre the motorway meets the road: the tile's edge. */
const RAMP_EDGE = 0.5;

/**
 * The control points of a motorway's curve. Each end starts at its ramp tile's edge on the road,
 * not its centre, so cars turn onto the motorway at the edge. With no road to follow, the end
 * stays on the tile centre.
 */
export function curvePoints(
  grid: Grid,
  a: number,
  b: number,
  handles: readonly CurvePoint[],
  aDir: CurvePoint | null,
  bDir: CurvePoint | null,
): CurvePoint[] {
  const ca = tileCentre(grid, a);
  const cb = tileCentre(grid, b);
  const start = aDir
    ? { x: ca.x - aDir.x * RAMP_EDGE, y: ca.y - aDir.y * RAMP_EDGE }
    : ca;
  const end = bDir
    ? { x: cb.x + bDir.x * RAMP_EDGE, y: cb.y + bDir.y * RAMP_EDGE }
    : cb;
  return [start, ...handles, end];
}

/** The curve of a motorway from its ramp `a` to its ramp `b`. */
export function motorwayCurve(grid: Grid, m: Motorway): CurvePoint[] {
  return sampleCurve(
    curvePoints(grid, m.a, m.b, m.handles, m.aDir, m.bDir),
    m.aDir,
    m.bDir,
  );
}

/** The curve of a motorway in the order it is travelled, starting at `from`, which is either ramp. */
export function curveFrom(grid: Grid, m: Motorway, from: number): CurvePoint[] {
  const curve = motorwayCurve(grid, m);
  return from === m.a ? curve : curve.reverse();
}

/**
 * Picks `count` handles from a drag, spaced evenly by distance along it. The drag's ends are
 * left out, since they are the ramps, which sit on tile centres.
 */
export function handlesFromDrag(
  drag: readonly CurvePoint[],
  count: number,
): CurvePoint[] {
  const total = polylineLength(drag);
  if (count <= 0 || total === 0) return [];
  const out: CurvePoint[] = [];
  for (let j = 1; j <= count; j++) {
    out.push(pointAtDistance(drag, (total * j) / (count + 1)));
  }
  return out;
}

/** The shortest distance from a point to a polyline, in tile units. */
export function distanceToCurve(
  curve: readonly CurvePoint[],
  p: CurvePoint,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (let k = 1; k < curve.length; k++) {
    const a = curve[k - 1];
    const b = curve[k];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
          );
    best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
  }
  return best;
}
