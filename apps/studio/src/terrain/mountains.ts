import type { Shape } from '@overpass-game/map-schema';
import { union } from 'polygon-clipping';
import { IMPORT } from '../config.ts';
import { ringArea, simplifyRing, smoothSpline } from '../import/geometry.ts';

/** A ring of [x, y] pairs in grid units. */
type Ring = [number, number][];

function dropRepeatedEnd(ring: Ring): Ring {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (
    ring.length > 1 &&
    first &&
    last &&
    first[0] === last[0] &&
    first[1] === last[1]
  )
    return ring.slice(0, -1);
  return ring;
}

/**
 * Turns grid cells at or above a threshold into mountain outlines. Touching
 * cells join into one shape. Only each shape's outer edge is kept; a hole
 * (a valley inside a ridge, say) is dropped, as holes are elsewhere at import.
 * Cells with no elevation data (NaN) are never raised.
 */
export function deriveMountains(
  elevation: Float32Array,
  cols: number,
  rows: number,
  threshold: number,
): Shape[] {
  const squares: Ring[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if ((elevation[row * cols + col] ?? Number.NaN) >= threshold)
        squares.push([
          [col, row],
          [col + 1, row],
          [col + 1, row + 1],
          [col, row + 1],
        ]);
    }
  }
  if (squares.length === 0) return [];

  const shapes: Shape[] = [];
  for (const polygon of union(squares.map((ring) => [ring]))) {
    const outer = polygon[0];
    if (!outer) continue;
    const points = simplifyRing(
      dropRepeatedEnd(outer).map(([x, y]) => ({ x, y })),
      IMPORT.simplifyTolerance,
    );
    if (points.length < 3 || ringArea(points) < IMPORT.minClosedArea) continue;
    shapes.push({
      id: `terrain-${shapes.length}`,
      kind: 'closedSpline',
      points: smoothSpline(points, true),
      origin: 'osm',
    });
  }
  return shapes;
}
