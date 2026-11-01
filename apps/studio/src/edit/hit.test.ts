import { describe, expect, it } from 'vitest';
import {
  parseSourceMap,
  type Shape,
  type SourceMap,
} from '@overpass-game/map-schema';
import { anchorOf, centreOf, handleOf, hitTest } from './hit.ts';

const lake: Shape = {
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

const bay: Shape = {
  id: 'bay',
  kind: 'closedSpline',
  origin: 'painted',
  points: [
    { x: 20, y: 0, handleOut: { x: 4, y: 0 } },
    { x: 30, y: 0, handleIn: { x: -4, y: 0 } },
    { x: 30, y: 10 },
  ],
};

const road = {
  id: 'guide-1',
  points: [
    { x: 0, y: 30 },
    { x: 10, y: 30 },
  ],
};

function mapWith(water: Shape[], guide = [road]): SourceMap {
  return parseSourceMap({
    schemaVersion: 1,
    id: 'test',
    name: 'Test',
    region: { bbox: [-100, 30, -99, 31], rotationDeg: 0 },
    grid: { cols: 40, rows: 40, districts: [] },
    layers: {
      water,
      mountains: [],
      parks: [],
      spawnZones: [],
      motorwayGuide: guide,
      starterRoads: [],
    },
    rules: [],
    palette: 'default',
    attribution: '© test',
  });
}

describe('hitTest', () => {
  it('finds an anchor within tolerance', () => {
    const hit = hitTest(mapWith([lake]), { x: 0.1, y: 0.1 }, 0.5, null);
    expect(hit).toMatchObject({
      kind: 'point',
      layer: 'water',
      id: 'lake',
      index: 0,
    });
  });

  it('finds an edge and names its segment', () => {
    // The bottom edge runs from point 0 to point 1: segment 0.
    const bottom = hitTest(mapWith([lake]), { x: 5, y: 0.1 }, 0.5, null);
    expect(bottom).toMatchObject({ kind: 'edge', id: 'lake', segment: 0 });
    // The right edge runs from point 1 to point 2: segment 1.
    const right = hitTest(mapWith([lake]), { x: 10, y: 5 }, 0.5, null);
    expect(right).toMatchObject({ kind: 'edge', id: 'lake', segment: 1 });
  });

  it('finds the inside of a closed shape', () => {
    const hit = hitTest(mapWith([lake]), { x: 5, y: 5 }, 0.5, null);
    expect(hit).toMatchObject({ kind: 'body', id: 'lake' });
  });

  it('returns null when nothing is close', () => {
    expect(hitTest(mapWith([lake]), { x: 30, y: 30 }, 0.5, null)).toBeNull();
  });

  it('prefers a handle of the selected shape', () => {
    const map = mapWith([bay]);
    const target = { layer: 'water' as const, id: 'bay' };
    // The handle sits at (24, 0), on the curve, so an edge hit is also close.
    const hit = hitTest(map, { x: 24, y: 0.1 }, 0.5, target);
    expect(hit).toMatchObject({ kind: 'handle', index: 0, which: 'handleOut' });
  });

  it('does not offer handles of an unselected shape', () => {
    const hit = hitTest(mapWith([bay]), { x: 24, y: 0.1 }, 0.5, null);
    expect(hit?.kind).not.toBe('handle');
  });

  it('finds a polyline anchor in the motorway guide', () => {
    const hit = hitTest(mapWith([], [road]), { x: 0, y: 30 }, 0.5, null);
    expect(hit).toMatchObject({
      kind: 'point',
      layer: 'motorwayGuide',
      index: 0,
    });
  });
});

describe('anchorOf, handleOf and centreOf', () => {
  it('reads anchor and handle positions in grid units', () => {
    const map = mapWith([bay]);
    const target = { layer: 'water' as const, id: 'bay' };
    expect(anchorOf(map, target, 1)).toEqual({ x: 30, y: 0 });
    expect(handleOf(map, target, 0, 'handleOut')).toEqual({ x: 24, y: 0 });
    expect(handleOf(map, target, 2, 'handleIn')).toBeNull();
  });

  it('centres a shape on its anchors', () => {
    expect(centreOf(mapWith([lake]), { layer: 'water', id: 'lake' })).toEqual({
      x: 5,
      y: 5,
    });
  });
});
