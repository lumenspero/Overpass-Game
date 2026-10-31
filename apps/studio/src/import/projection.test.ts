import { describe, expect, it } from 'vitest';
import { frameAt, frameCornersLonLat } from '../geo/frame.ts';
import { projectToGrid } from './projection.ts';

const TULSA: [number, number] = [-95.99, 36.15];

describe('projectToGrid', () => {
  it('maps the frame centre to the middle of the grid', () => {
    const frame = frameAt(TULSA, 48, 32, 25);
    const p = projectToGrid(frame)(TULSA);
    expect(p.x).toBeCloseTo(24, 6);
    expect(p.y).toBeCloseTo(16, 6);
  });

  it.each([0, 30, 90, -135])(
    'maps the frame corners to the grid corners when turned %d°',
    (rotationDeg) => {
      const frame = frameAt(TULSA, 48, 32, rotationDeg);
      const project = projectToGrid(frame);
      // Corners come back south-west, south-east, north-east, north-west.
      const [sw, se, ne, nw] = frameCornersLonLat(frame).map(project);
      const expected = [
        [0, 32],
        [48, 32],
        [48, 0],
        [0, 0],
      ];
      for (const [got, want] of [
        [sw, expected[0]],
        [se, expected[1]],
        [ne, expected[2]],
        [nw, expected[3]],
      ] as const) {
        expect(got!.x).toBeCloseTo(want![0]!, 6);
        expect(got!.y).toBeCloseTo(want![1]!, 6);
      }
    },
  );

  it('puts north on the top edge of the grid', () => {
    const frame = frameAt(TULSA, 48, 48, 0);
    const north = projectToGrid(frame)([TULSA[0], TULSA[1] + 0.02]);
    expect(north.y).toBeLessThan(24);
  });
});
