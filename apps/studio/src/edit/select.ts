import { sampleSpline } from '@overpass-game/map-compiler';
import type { EditItem, Pt } from './hit.ts';

/** A rectangle in source-map grid units, with x0 <= x1 and y0 <= y1. */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function rectFrom(a: Pt, b: Pt): Rect {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

/** True when every anchor of the shape lies inside the rectangle. */
export function insideRect(item: EditItem, r: Rect): boolean {
  return (
    item.points.length > 0 &&
    item.points.every(
      (p) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1,
    )
  );
}

/**
 * Length in tiles along the drawn curve: the path length of a stroke or line, or the
 * perimeter of a closed shape.
 */
export function lengthOf(item: EditItem): number {
  const closed = item.kind === 'closedSpline';
  const s = sampleSpline(item.points, closed);
  const segments = closed ? s.length : s.length - 1;
  let total = 0;
  for (let i = 0; i < segments; i++) {
    const a = s[i]!;
    const b = s[(i + 1) % s.length]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
