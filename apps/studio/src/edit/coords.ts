import type { Pt } from './hit.ts';

/** The preview's transform: canvas x = a*u + c*v + e, y = b*u + d*v + f (see PreviewCanvas). */
export interface Affine {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

/**
 * Inverts the preview transform: a CSS pixel back to a point in source-map grid units. The
 * preview draws tile-local coordinates (u east, v north, origin at the centre), and a source
 * point is (u + cols/2, rows/2 - v). Returns null when the transform cannot be inverted.
 */
export function pixelToSource(
  m: Affine,
  cols: number,
  rows: number,
  px: number,
  py: number,
): Pt | null {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0 || !Number.isFinite(det)) return null;
  const x = px - m.e;
  const y = py - m.f;
  const u = (m.d * x - m.c * y) / det;
  const v = (-m.b * x + m.a * y) / det;
  return { x: u + cols / 2, y: rows / 2 - v };
}
