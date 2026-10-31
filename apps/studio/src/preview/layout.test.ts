import { describe, expect, it } from 'vitest';
import { previewLayout } from './layout.ts';

/** Maps a tile-local point to canvas pixels using the layout's matrix. */
function toCanvas(
  m: ReturnType<typeof previewLayout>['matrix'],
  u: number,
  v: number,
): [number, number] {
  return [m.a * u + m.c * v + m.e, m.b * u + m.d * v + m.f];
}

describe('previewLayout', () => {
  it('fits an unturned frame with north up', () => {
    const { scale, matrix } = previewLayout(
      { cols: 40, rows: 20, rotationDeg: 0 },
      400,
      300,
    );
    expect(scale).toBeGreaterThan(0);
    // The north-west corner (-cols/2, +rows/2) lands in the top-left quadrant.
    const [x, y] = toCanvas(matrix, -20, 10);
    expect(x).toBeLessThan(200);
    expect(y).toBeLessThan(150);
  });

  it('turns counter-clockwise on screen: the north edge moves to the west after +90°', () => {
    const { matrix } = previewLayout(
      { cols: 40, rows: 20, rotationDeg: 90 },
      400,
      300,
    );
    // The point due north of the centre (0, 10) moves to the left (west) of centre.
    const [x, y] = toCanvas(matrix, 0, 10);
    expect(x).toBeLessThan(200);
    expect(y).toBeCloseTo(150, 6);
  });

  it('keeps the whole frame on the canvas at any angle', () => {
    for (const rotationDeg of [0, 30, 45, 90, -135]) {
      const { matrix } = previewLayout(
        { cols: 60, rows: 40, rotationDeg },
        320,
        240,
      );
      for (const [u, v] of [
        [-30, -20],
        [30, -20],
        [30, 20],
        [-30, 20],
      ] as const) {
        const [x, y] = toCanvas(matrix, u, v);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(320);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(240);
      }
    }
  });

  it('returns zero scale for an empty canvas', () => {
    expect(
      previewLayout({ cols: 10, rows: 10, rotationDeg: 0 }, 0, 0).scale,
    ).toBe(0);
  });
});
