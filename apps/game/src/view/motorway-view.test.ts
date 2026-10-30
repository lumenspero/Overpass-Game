import { createGrid, tuning } from '@overpass-game/sim';
import { afterEach, describe, expect, it } from 'vitest';
import { motorwayParts, motorwayPreview } from './motorway-view.ts';

afterEach(() => {
  tuning.MOTORWAY_MAX_NODES = 4;
});

const grid = createGrid(8, 8);

describe('motorwayPreview', () => {
  it('is null until the drag has moved', () => {
    expect(motorwayPreview(grid, [{ x: 1.5, y: 2.5 }])).toBeNull();
    expect(
      motorwayPreview(grid, [
        { x: 1.2, y: 2.2 },
        { x: 1.8, y: 2.8 },
      ]),
    ).toBeNull();
  });

  it('starts and ends on the centres of the tiles pressed and released', () => {
    const curve = motorwayPreview(grid, [
      { x: 1.5, y: 2.5 },
      { x: 5.5, y: 2.5 },
    ]);
    expect(curve).not.toBeNull();
    const first = curve?.[0];
    const last = curve?.[curve.length - 1];
    expect(first).toEqual({ x: 1.5, y: 2.5 });
    expect(last?.x).toBeCloseTo(5.5);
    expect(last?.y).toBeCloseTo(2.5);
  });

  it('is null when the pointer is off the map', () => {
    expect(
      motorwayPreview(grid, [
        { x: 1.5, y: 2.5 },
        { x: 9.5, y: 2.5 },
      ]),
    ).toBeNull();
  });
});

describe('motorwayParts', () => {
  it('splits a straight motorway into ramps at each end and a middle between', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
    ];
    const parts = motorwayParts(line);
    expect(parts.start[0]).toEqual({ x: 0, y: 0 });
    expect(parts.start[parts.start.length - 1].x).toBeCloseTo(1);
    expect(parts.middle[0].x).toBeCloseTo(1);
    expect(parts.middle[parts.middle.length - 1].x).toBeCloseTo(7);
    expect(parts.end[0].x).toBeCloseTo(7);
    expect(parts.end[parts.end.length - 1]).toEqual({ x: 8, y: 0 });
  });
});
