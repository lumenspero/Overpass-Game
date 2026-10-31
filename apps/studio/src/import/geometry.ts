import type { Shape } from '@overpass-game/map-schema';
import type { GridPoint } from './projection.ts';

type SplinePoint = Shape['points'][number];

function distanceToSegment(p: GridPoint, a: GridPoint, b: GridPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas-Peucker simplification of an open line. Keeps both ends. */
export function simplifyLine(
  points: readonly GridPoint[],
  tolerance: number,
): GridPoint[] {
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() ?? [0, 0];
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(points[i]!, points[start]!, points[end]!);
      if (d > worstDistance) {
        worst = i;
        worstDistance = d;
      }
    }
    if (worst !== -1) {
      keep[worst] = true;
      stack.push([start, worst], [worst, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Simplifies a closed ring. The ring is treated as a line that starts and ends
 * at its first point, and the repeated end point is dropped. Rings that shrink
 * below three points come back empty.
 */
export function simplifyRing(
  points: readonly GridPoint[],
  tolerance: number,
): GridPoint[] {
  if (points.length < 3) return [];
  const first = points[0]!;
  const closed = [...points, first];
  const simplified = simplifyLine(closed, tolerance).slice(0, -1);
  return simplified.length >= 3 ? simplified : [];
}

/** Absolute area of a ring by the shoelace formula, in square tiles. */
export function ringArea(points: readonly GridPoint[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Length of an open line, in tiles. */
export function lineLength(points: readonly GridPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i]!.x - points[i - 1]!.x,
      points[i]!.y - points[i - 1]!.y,
    );
  }
  return total;
}

/**
 * Smooths points into a spline. Each point gets Catmull-Rom handles, so the
 * curve passes through every point, like the original's rounded rivers and
 * coastlines. Ends of an open line use themselves as the missing neighbour.
 */
export function smoothSpline(
  points: readonly GridPoint[],
  closed: boolean,
): SplinePoint[] {
  const n = points.length;
  return points.map((p, i) => {
    const prev = closed
      ? points[(i - 1 + n) % n]!
      : points[Math.max(0, i - 1)]!;
    const next = closed
      ? points[(i + 1) % n]!
      : points[Math.min(n - 1, i + 1)]!;
    const tx = (next.x - prev.x) / 6;
    const ty = (next.y - prev.y) / 6;
    return {
      x: p.x,
      y: p.y,
      handleIn: { x: -tx, y: -ty },
      handleOut: { x: tx, y: ty },
    };
  });
}
