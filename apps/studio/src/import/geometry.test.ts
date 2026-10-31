import { describe, expect, it } from 'vitest';
import {
  lineLength,
  ringArea,
  simplifyLine,
  simplifyRing,
  smoothSpline,
} from './geometry.ts';

const square = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

describe('simplifyLine', () => {
  it('drops a point that lies on the line between its neighbours', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(simplifyLine(line, 0.01)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('keeps a point that deviates more than the tolerance', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ];
    expect(simplifyLine(line, 0.5)).toHaveLength(3);
  });
});

describe('simplifyRing and ringArea', () => {
  it('keeps the corners of a square', () => {
    expect(simplifyRing(square, 0.05)).toHaveLength(4);
  });

  it('drops a ring that collapses below three points', () => {
    expect(
      simplifyRing(
        [
          { x: 0, y: 0 },
          { x: 0.01, y: 0 },
          { x: 0, y: 0.01 },
        ],
        0.5,
      ),
    ).toEqual([]);
  });

  it('measures area in square tiles', () => {
    expect(ringArea(square)).toBeCloseTo(16, 9);
  });
});

describe('lineLength', () => {
  it('sums segment lengths', () => {
    expect(
      lineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]),
    ).toBeCloseTo(5, 9);
  });
});

describe('smoothSpline', () => {
  it('gives every point handles that are opposite offsets', () => {
    const points = smoothSpline(square, true);
    for (const p of points) {
      expect(p.handleIn?.x).toBeCloseTo(-(p.handleOut?.x ?? 0), 9);
      expect(p.handleIn?.y).toBeCloseTo(-(p.handleOut?.y ?? 0), 9);
    }
  });

  it('keeps the original points', () => {
    const points = smoothSpline(square, false);
    expect(points.map((p) => [p.x, p.y])).toEqual(
      square.map((p) => [p.x, p.y]),
    );
  });
});
