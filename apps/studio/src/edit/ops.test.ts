import { describe, expect, it } from 'vitest';
import {
  parseSourceMap,
  type Shape,
  type SourceMap,
} from '@overpass-game/map-schema';
import { sampleSpline } from '@overpass-game/map-compiler';
import {
  addItem,
  deletePoint,
  insertPoint,
  movePoint,
  moveHandle,
  nextId,
  removeItem,
  rotateShape,
  scaleShape,
  setShapeLocked,
  snapValue,
  translateShape,
} from './ops.ts';

const square: Shape = {
  id: 'lake',
  kind: 'closedSpline',
  origin: 'painted',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
};

const curvedBay: Shape = {
  id: 'bay',
  kind: 'closedSpline',
  origin: 'painted',
  points: [
    { x: 0, y: 0, handleOut: { x: 4, y: 0 } },
    { x: 10, y: 0, handleIn: { x: -4, y: 0 } },
    { x: 10, y: 10 },
  ],
};

const road = {
  id: 'guide-1',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
};

function makeMap(): SourceMap {
  return parseSourceMap({
    schemaVersion: 2,
    id: 'test',
    name: 'Test',
    region: { bbox: [-100, 30, -99, 31], rotationDeg: 0 },
    grid: { cols: 20, rows: 20, fence: { col: 0, row: 0, cols: 20, rows: 20 } },
    layers: {
      water: [square],
      mountains: [],
      parks: [],
      spawnZones: [],
      motorwayGuide: [road],
      starterRoads: [],
    },
    rules: [],
    palette: 'default',
    attribution: '© test',
  });
}

const waterOf = (m: SourceMap) => m.layers.water;

describe('snapValue', () => {
  it('rounds to the step and never returns -0', () => {
    expect(snapValue(1.3, 0.5)).toBe(1.5);
    expect(snapValue(-0.1, 0.5)).toBe(0);
    expect(Object.is(snapValue(-0.1, 0.5), -0)).toBe(false);
  });
});

describe('movePoint and moveHandle', () => {
  it('moves a point to a snapped position', () => {
    const m = makeMap();
    const moved = movePoint(m, 'water', 'lake', 0, { x: 1.2, y: 0.9 }, 0.5);
    expect(moved).not.toBe(m);
    const lake = waterOf(moved)[0] as Shape;
    expect(lake.points[0]).toMatchObject({ x: 1, y: 1 });
    // An unknown shape id changes nothing.
    expect(movePoint(m, 'water', 'bay', 0, { x: 1, y: 1 }, 0.5)).toBe(m);
  });

  it('moves a handle as an offset from its point', () => {
    const m = addItem(makeMap(), 'water', curvedBay);
    const out = moveHandle(
      m,
      'water',
      'bay',
      0,
      'handleOut',
      { x: 3, y: 2 },
      1,
    );
    const bay = waterOf(out)[1] as Shape;
    expect(bay.points[0]?.handleOut).toEqual({ x: 3, y: 2 });
  });

  it('refuses an index out of range', () => {
    const m = makeMap();
    expect(movePoint(m, 'water', 'lake', 9, { x: 1, y: 1 }, 1)).toBe(m);
  });
});

describe('insertPoint', () => {
  it('adds a midpoint on a straight segment and keeps the outline', () => {
    const m = makeMap();
    const out = insertPoint(m, 'water', 'lake', 0);
    const lake = waterOf(out)[0] as Shape;
    expect(lake.points).toHaveLength(5);
    expect(lake.points[1]).toMatchObject({ x: 5, y: 0 });
    const before = sampleSpline(waterOf(m)[0]!.points, true);
    const after = sampleSpline(lake.points, true);
    // Every original corner still lies on the new outline.
    for (const p of [
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]) {
      expect(after.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9)).toBe(
        true,
      );
    }
    expect(before.length).toBeGreaterThan(0);
  });

  it('splits a curve at its midpoint without changing its shape', () => {
    const m = addItem(makeMap(), 'water', curvedBay);
    const bay = curvedBay;
    const original = sampleSpline(bay.points, true);
    const out = insertPoint(m, 'water', 'bay', 0);
    const split = waterOf(out)[1] as Shape;
    expect(split.points).toHaveLength(4);
    // The new midpoint is the curve at t = 0.5, which is sample 8 of the first segment.
    const expected = original[8]!;
    expect(split.points[1]!.x).toBeCloseTo(expected.x, 9);
    expect(split.points[1]!.y).toBeCloseTo(expected.y, 9);
  });

  it('inserts into a polyline without handles', () => {
    const m = makeMap();
    const out = insertPoint(m, 'motorwayGuide', 'guide-1', 0);
    expect(out.layers.motorwayGuide[0]!.points[1]).toEqual({ x: 5, y: 0 });
  });

  it('refuses a segment past the end of an open line', () => {
    const m = makeMap();
    expect(insertPoint(m, 'motorwayGuide', 'guide-1', 1)).toBe(m);
  });
});

describe('deletePoint', () => {
  it('removes a point', () => {
    const out = deletePoint(makeMap(), 'water', 'lake', 2);
    expect((waterOf(out)[0] as Shape).points).toHaveLength(3);
  });

  it('refuses to drop a closed shape below three points', () => {
    const once = deletePoint(makeMap(), 'water', 'lake', 0);
    const twice = deletePoint(once, 'water', 'lake', 0);
    expect((waterOf(twice)[0] as Shape).points).toHaveLength(3);
    expect(deletePoint(twice, 'water', 'lake', 0)).toBe(twice);
  });

  it('refuses to drop a polyline below two points', () => {
    const m = makeMap();
    expect(deletePoint(m, 'motorwayGuide', 'guide-1', 0)).toBe(m);
  });
});

describe('whole-shape transforms', () => {
  it('translates every point and leaves handles as offsets', () => {
    const m = addItem(makeMap(), 'water', curvedBay);
    const out = translateShape(m, 'water', 'bay', 2, -1);
    const bay = waterOf(out)[1] as Shape;
    expect(bay.points[0]).toMatchObject({ x: 2, y: -1 });
    expect(bay.points[0]?.handleOut).toEqual({ x: 4, y: 0 });
  });

  it('scales about a centre and scales handle offsets too', () => {
    const m = addItem(makeMap(), 'water', curvedBay);
    const out = scaleShape(m, 'water', 'bay', 0, 0, 2);
    const bay = waterOf(out)[1] as Shape;
    expect(bay.points[1]).toMatchObject({ x: 20, y: 0 });
    expect(bay.points[0]?.handleOut).toEqual({ x: 8, y: 0 });
  });

  it('rotates a quarter turn about the origin', () => {
    const out = rotateShape(makeMap(), 'water', 'lake', 0, 0, Math.PI / 2);
    const lake = waterOf(out)[0] as Shape;
    expect(lake.points[1]!.x).toBeCloseTo(0, 9);
    expect(lake.points[1]!.y).toBeCloseTo(10, 9);
  });

  it('refuses a non-positive scale', () => {
    const m = makeMap();
    expect(scaleShape(m, 'water', 'lake', 0, 0, 0)).toBe(m);
  });
});

describe('locks', () => {
  it('a locked shape does not change, and can be unlocked', () => {
    const locked = setShapeLocked(makeMap(), 'water', 'lake', true);
    expect(translateShape(locked, 'water', 'lake', 1, 1)).toBe(locked);
    expect(movePoint(locked, 'water', 'lake', 0, { x: 1, y: 1 }, 1)).toBe(
      locked,
    );
    const unlocked = setShapeLocked(locked, 'water', 'lake', false);
    expect(translateShape(unlocked, 'water', 'lake', 1, 1)).not.toBe(unlocked);
  });

  it('setting the lock to its current value changes nothing', () => {
    const m = makeMap();
    expect(setShapeLocked(m, 'water', 'lake', false)).toBe(m);
  });
});

describe('add, remove and ids', () => {
  it('gives new shapes unused ids', () => {
    const m = makeMap();
    expect(nextId(m, 'lake')).toBe('lake-1');
    expect(nextId(m, 'road')).toBe('road-1');
  });

  it('refuses an id that is already used in any layer', () => {
    const m = makeMap();
    expect(addItem(m, 'parks', { ...square, id: 'lake' })).toBe(m);
  });

  it('removes an item and returns the same map when it is absent', () => {
    const m = makeMap();
    expect(removeItem(m, 'water', 'lake').layers.water).toHaveLength(0);
    expect(removeItem(m, 'water', 'nope')).toBe(m);
  });
});
