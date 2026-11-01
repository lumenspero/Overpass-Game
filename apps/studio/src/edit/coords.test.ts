import { describe, expect, it } from 'vitest';
import { previewLayout } from '../preview/layout.ts';
import { pixelToSource } from './coords.ts';

describe('pixelToSource', () => {
  const cases = [
    { cols: 48, rows: 32, rotationDeg: 0 },
    { cols: 48, rows: 32, rotationDeg: 37 },
  ];
  for (const frame of cases) {
    it(`inverts the preview transform at ${frame.rotationDeg}°`, () => {
      const { matrix } = previewLayout(frame, 800, 600);
      const samples = [
        { x: 0, y: 0 },
        { x: 10.5, y: 20.25 },
        { x: 47, y: 31 },
      ];
      for (const p of samples) {
        // Forward: source point -> tile-local -> canvas pixel, as PreviewCanvas draws it.
        const u = p.x - frame.cols / 2;
        const v = frame.rows / 2 - p.y;
        const px = matrix.a * u + matrix.c * v + matrix.e;
        const py = matrix.b * u + matrix.d * v + matrix.f;
        const back = pixelToSource(matrix, frame.cols, frame.rows, px, py);
        expect(back).not.toBeNull();
        expect(back!.x).toBeCloseTo(p.x, 9);
        expect(back!.y).toBeCloseTo(p.y, 9);
      }
    });
  }

  it('returns null for a transform that cannot be inverted', () => {
    const flat = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
    expect(pixelToSource(flat, 10, 10, 5, 5)).toBeNull();
  });
});
