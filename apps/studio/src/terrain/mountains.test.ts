import { describe, expect, it } from 'vitest';
import { ringArea } from '../import/geometry.ts';
import { deriveMountains } from './mountains.ts';

/** A cols x rows grid where the listed cells are high (1000 m) and the rest are sea level. */
function grid(
  cols: number,
  rows: number,
  raised: readonly [number, number][],
): Float32Array {
  const out = new Float32Array(cols * rows);
  for (const [col, row] of raised) out[row * cols + col] = 1000;
  return out;
}

/** The cells of a square block that starts at (c0, r0). */
function block(c0: number, r0: number, size: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = r0; r < r0 + size; r++)
    for (let c = c0; c < c0 + size; c++) cells.push([c, r]);
  return cells;
}

describe('deriveMountains', () => {
  it('turns one block of high cells into one mountain', () => {
    const shapes = deriveMountains(grid(4, 4, block(1, 1, 2)), 4, 4, 500);
    expect(shapes).toHaveLength(1);
    const shape = shapes[0]!;
    expect(shape.id).toBe('terrain-0');
    expect(shape.kind).toBe('closedSpline');
    expect(shape.origin).toBe('osm');
    expect(ringArea(shape.points)).toBeCloseTo(4);
  });

  it('keeps separate blocks as separate mountains', () => {
    const cells = [...block(0, 0, 1), ...block(3, 3, 1)];
    const shapes = deriveMountains(grid(4, 4, cells), 4, 4, 500);
    expect(shapes).toHaveLength(2);
    for (const shape of shapes) expect(ringArea(shape.points)).toBeCloseTo(1);
  });

  it('counts a cell exactly at the threshold', () => {
    const elevation = new Float32Array([500, 0, 0, 0]);
    expect(deriveMountains(elevation, 2, 2, 500)).toHaveLength(1);
  });

  it('returns nothing when no cell reaches the threshold', () => {
    expect(deriveMountains(grid(4, 4, block(0, 0, 2)), 4, 4, 1500)).toEqual([]);
  });

  it('ignores cells with no elevation data', () => {
    const elevation = new Float32Array(4).fill(Number.NaN);
    expect(deriveMountains(elevation, 2, 2, 500)).toEqual([]);
  });

  it('keeps only the outer edge when the high cells surround a low centre', () => {
    const ring = block(0, 0, 3).filter(([c, r]) => !(c === 1 && r === 1));
    const shapes = deriveMountains(grid(3, 3, ring), 3, 3, 500);
    expect(shapes).toHaveLength(1);
    expect(ringArea(shapes[0]!.points)).toBeCloseTo(9);
  });
});
