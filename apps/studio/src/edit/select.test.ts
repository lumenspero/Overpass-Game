import { describe, expect, it } from 'vitest';
import type { EditItem } from './hit.ts';
import { insideRect, lengthOf, rectFrom } from './select.ts';

const square: EditItem = {
  id: 'lake',
  kind: 'closedSpline',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
};

describe('rectFrom', () => {
  it('orders the corners', () => {
    expect(rectFrom({ x: 5, y: 9 }, { x: 1, y: 2 })).toEqual({
      x0: 1,
      y0: 2,
      x1: 5,
      y1: 9,
    });
  });
});

describe('insideRect', () => {
  it('needs every anchor inside', () => {
    expect(insideRect(square, { x0: -1, y0: -1, x1: 11, y1: 11 })).toBe(true);
    expect(insideRect(square, { x0: -1, y0: -1, x1: 9, y1: 11 })).toBe(false);
  });
});

describe('lengthOf', () => {
  it('is the perimeter of a closed shape', () => {
    expect(lengthOf(square)).toBeCloseTo(40, 6);
  });
  it('is the path length of a stroke', () => {
    const stroke: EditItem = {
      id: 'river',
      kind: 'strokeSpline',
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    };
    expect(lengthOf(stroke)).toBeCloseTo(5, 6);
  });
});
