import type { Shape, SourceMap } from '@overpass-game/map-schema';
import { TRIM_MARGIN } from '@overpass-game/map-compiler';
import { IMPORT } from '../config.ts';

type SplinePoint = Shape['points'][number];
type P = { x: number; y: number };

/** Outlines are resampled this often, in tiles, before they are smoothed. */
const RESAMPLE_STEP = 0.5;
/** Points this close, in tiles, count as the same point shared by two shapes. */
const SHARED_EPS = 0.02;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Points every `step` along a path. An open path keeps both ends. */
function resample(pts: readonly P[], closed: boolean, step: number): P[] {
  const path = closed ? [...pts, pts[0]!] : [...pts];
  const out: P[] = [path[0]!];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = dist(a, b);
    let t = step - carry;
    while (t <= len) {
      out.push({
        x: a.x + ((b.x - a.x) * t) / len,
        y: a.y + ((b.y - a.y) * t) / len,
      });
      t += step;
    }
    carry = len - (t - step);
  }
  const last = out[out.length - 1]!;
  if (closed) {
    if (out.length > 1 && dist(last, out[0]!) < step / 2) out.pop();
  } else if (dist(last, path[path.length - 1]!) > 1e-9) {
    out.push(path[path.length - 1]!);
  }
  return out;
}

/** A weighted moving average over `w` neighbours each side. An open path keeps its ends. */
function average(pts: readonly P[], closed: boolean, w: number): P[] {
  if (w < 1) return [...pts];
  const n = pts.length;
  return pts.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return p;
    const reach = closed ? w : Math.min(w, i, n - 1 - i);
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let k = -reach; k <= reach; k++) {
      const q = pts[(((i + k) % n) + n) % n]!;
      const wt = reach + 1 - Math.abs(k);
      sx += q.x * wt;
      sy += q.y * wt;
      sw += wt;
    }
    return { x: sx / sw, y: sy / sw };
  });
}

function signedArea(pts: readonly P[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Scales a ring about its centre so it has the given area. Smoothing shrinks rings a little. */
function keepArea(pts: readonly P[], target: number): P[] {
  const a = Math.abs(signedArea(pts));
  if (a < 1e-9) return [...pts];
  const k = Math.sqrt(Math.abs(target) / a);
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
}

/** Visvalingam-Whyatt: drops the point that spans the smallest triangle until `keep` remain. */
function reduce(pts: readonly P[], closed: boolean, keep: number): P[] {
  const out = [...pts];
  const tri = (a: P, b: P, c: P) =>
    Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  while (out.length > keep) {
    const n = out.length;
    let best = -1;
    let bestArea = Infinity;
    for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
      const a = tri(out[(i - 1 + n) % n]!, out[i]!, out[(i + 1) % n]!);
      if (a < bestArea) {
        bestArea = a;
        best = i;
      }
    }
    if (best < 0) break;
    out.splice(best, 1);
  }
  return out;
}

function perimeter(pts: readonly P[], closed: boolean): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1]!, pts[i]!);
  return closed && pts.length > 1 ? s + dist(pts[pts.length - 1]!, pts[0]!) : s;
}

/** Smooths and simplifies one open run with fixed ends, keeping `keep` points in all. */
function smoothRun(
  run: readonly P[],
  closed: boolean,
  detail: number,
  keep: number,
): P[] {
  const reach = Math.min(
    (1 - detail) * IMPORT.smoothReachMax,
    perimeter(run, closed) / 8,
  );
  let pts = resample(run, closed, RESAMPLE_STEP);
  pts = average(pts, closed, Math.round(reach / RESAMPLE_STEP));
  if (closed) pts = keepArea(pts, signedArea(run));
  return reduce(pts, closed, keep);
}

/**
 * Curve handles through the points. A pinned point, shared with a neighbouring shape, gets none,
 * so both shapes draw the same straight join there and their edges stay together.
 */
function withHandles(
  pts: readonly P[],
  pinned: readonly boolean[],
  closed: boolean,
): SplinePoint[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const point: SplinePoint = { x: round2(p.x), y: round2(p.y) };
    if (pinned[i]) return point;
    const prev = closed ? pts[(i - 1 + n) % n]! : pts[Math.max(0, i - 1)]!;
    const next = closed ? pts[(i + 1) % n]! : pts[Math.min(n - 1, i + 1)]!;
    const tx = round2((next.x - prev.x) / 6);
    const ty = round2((next.y - prev.y) / 6);
    point.handleIn = { x: -tx, y: -ty };
    point.handleOut = { x: tx, y: ty };
    return point;
  });
}

const key = (p: P): string =>
  `${Math.round(p.x / SHARED_EPS)},${Math.round(p.y / SHARED_EPS)}`;

/** The grid a shape belongs to. With TRIM_MARGIN it gives the trim box, where cut edges lie. */
interface Bounds {
  cols: number;
  rows: number;
}

/** True when a point lies on the trim box, where trimming cut the shape. */
function onTrimEdge(p: P, b: Bounds | undefined): boolean {
  if (!b) return false;
  const near = (v: number, edge: number) => Math.abs(v - edge) < SHARED_EPS;
  return (
    near(p.x, -TRIM_MARGIN) ||
    near(p.y, -TRIM_MARGIN) ||
    near(p.x, b.cols + TRIM_MARGIN) ||
    near(p.y, b.rows + TRIM_MARGIN)
  );
}

/**
 * One shape smoothed to `detail`. `shared` holds the point keys used by more than one shape. Points
 * on the trim box are held too, so cut edges stay straight and pieces cut along it still meet.
 */
function smoothShape(
  shape: Shape,
  detail: number,
  shared: ReadonlySet<string>,
  bounds: Bounds | undefined,
): Shape {
  const closed = shape.kind === 'closedSpline';
  const src = shape.points;
  const minKeep = closed ? 6 : 2;
  // Painted shapes are the author's own, drawn as meant; only imported outlines are smoothed.
  if (
    detail >= 1 ||
    shape.locked ||
    shape.origin === 'painted' ||
    src.length <= minKeep
  ) {
    return shape;
  }
  const pin = src.map(
    (p, i) =>
      shared.has(key(p)) ||
      onTrimEdge(p, bounds) ||
      (!closed && (i === 0 || i === src.length - 1)),
  );

  if (closed && !pin.some(Boolean)) {
    const keep = Math.max(minKeep, Math.round(src.length * detail));
    const pts = smoothRun(src, true, detail, keep);
    return {
      ...shape,
      points: withHandles(
        pts,
        pts.map(() => false),
        true,
      ),
    };
  }

  // Walk from pinned point to pinned point. Pinned points stay; the runs between them are smoothed.
  const n = src.length;
  const start = closed ? pin.indexOf(true) : 0;
  const order = closed
    ? [
        ...Array.from({ length: n }, (_, i) => src[(start + i) % n]!),
        src[start]!,
      ]
    : [...src];
  const pins = closed
    ? [...Array.from({ length: n }, (_, i) => pin[(start + i) % n]!), true]
    : pin;
  const out: P[] = [];
  const outPinned: boolean[] = [];
  let runStart = 0;
  for (let i = 1; i < order.length; i++) {
    if (!pins[i]) continue;
    const run = order.slice(runStart, i + 1);
    const inner = run.length - 2;
    const pts =
      inner <= 0
        ? run
        : smoothRun(
            run,
            false,
            detail,
            Math.max(2, Math.round(inner * detail) + 2),
          );
    pts.slice(0, -1).forEach((p, k) => {
      out.push(p);
      outPinned.push(k === 0);
    });
    runStart = i;
  }
  if (!closed) {
    out.push(order[order.length - 1]!);
    outPinned.push(true);
  }
  if (out.length < (closed ? 3 : 2)) return shape;
  return { ...shape, points: withHandles(out, outPinned, closed) };
}

/**
 * Smooths a layer's shapes to `detail`, the share of each shape's points kept. Below 1 each outline
 * is resampled, averaged over a reach that grows as detail drops, simplified and given curve
 * handles; a closed shape keeps its area. Points two shapes share stay put, so neighbours still
 * meet; with `bounds`, so do points on the trim box. Locked and painted shapes are left as they are.
 */
export function smoothShapes(
  shapes: readonly Shape[],
  detail: number = IMPORT.shapeDetail,
  bounds?: Bounds,
): Shape[] {
  const owners = new Map<string, number>();
  shapes.forEach((s) => {
    for (const k of new Set(s.points.map(key)))
      owners.set(k, (owners.get(k) ?? 0) + 1);
  });
  const shared = new Set([...owners].filter(([, c]) => c > 1).map(([k]) => k));
  return shapes.map((s) => smoothShape(s, detail, shared, bounds));
}

/** A map with its water, mountain and park shapes smoothed to `detail`. */
export function smoothSource(
  map: SourceMap,
  detail: number = IMPORT.shapeDetail,
): SourceMap {
  return {
    ...map,
    layers: {
      ...map.layers,
      water: smoothShapes(map.layers.water, detail, map.grid),
      mountains: smoothShapes(map.layers.mountains, detail, map.grid),
      parks: smoothShapes(map.layers.parks, detail, map.grid),
    },
  };
}
