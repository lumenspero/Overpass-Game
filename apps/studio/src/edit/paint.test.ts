import { describe, expect, it } from 'vitest';
import {
  parseSourceMap,
  type Shape,
  type SourceMap,
} from '@overpass-game/map-schema';
import { buildPainted, dedupe } from './paint.ts';

const OPTS = { riverWidth: 0.4 };
const a = { x: 0, y: 0 };
const b = { x: 10, y: 0 };
const c = { x: 10, y: 10 };

function emptyMap(water: Shape[] = []): SourceMap {
  return parseSourceMap({
    schemaVersion: 2,
    id: 'test',
    name: 'Test',
    region: { bbox: [-100, 30, -99, 31], rotationDeg: 0 },
    grid: { cols: 20, rows: 20, fence: { col: 0, row: 0, cols: 20, rows: 20 } },
    layers: {
      water,
      mountains: [],
      parks: [],
      motorwayGuide: [],
      starterRoads: [],
    },
    rules: [],
    palette: 'default',
    attribution: '© test',
  });
}

describe('dedupe', () => {
  it('drops a point that repeats the one before it', () => {
    expect(dedupe([a, b, b, c])).toEqual([a, b, c]);
  });
});

describe('buildPainted', () => {
  it('makes a closed lake with a fresh id', () => {
    const built = buildPainted(emptyMap(), 'lake', [a, b, c], OPTS);
    expect(built?.layer).toBe('water');
    expect(built?.item).toMatchObject({
      id: 'lake-1',
      kind: 'closedSpline',
      origin: 'painted',
    });
  });

  it('drops the closing point of a closed shape', () => {
    const built = buildPainted(emptyMap(), 'lake', [a, b, c, a], OPTS);
    expect((built?.item as Shape).points).toHaveLength(3);
  });

  it('refuses a closed shape with fewer than three points', () => {
    expect(buildPainted(emptyMap(), 'lake', [a, b], OPTS)).toBeNull();
    // Two distinct points plus a double-click repeat are still two points.
    expect(buildPainted(emptyMap(), 'lake', [a, b, b], OPTS)).toBeNull();
  });

  it('makes a river as a stroke with the chosen width', () => {
    const built = buildPainted(emptyMap(), 'river', [a, b], OPTS);
    expect(built?.layer).toBe('water');
    expect(built?.item).toMatchObject({
      id: 'river-1',
      kind: 'strokeSpline',
      width: 0.4,
    });
  });

  it('refuses a river with one point', () => {
    expect(buildPainted(emptyMap(), 'river', [a], OPTS)).toBeNull();
  });

  it('makes a motorway guide as an open polyline with no kind', () => {
    const built = buildPainted(emptyMap(), 'guide', [a, b], OPTS);
    expect(built?.layer).toBe('motorwayGuide');
    expect(built?.item).toEqual({ id: 'motorway-1', points: [a, b] });
  });

  it('makes a starter road in its own layer', () => {
    const built = buildPainted(emptyMap(), 'road', [a, c], OPTS);
    expect(built?.layer).toBe('starterRoads');
    expect(built?.item.id).toBe('road-1');
  });

  it('skips ids already in use', () => {
    const existing = emptyMap([
      {
        id: 'lake-1',
        kind: 'closedSpline',
        origin: 'painted',
        points: [a, b, c],
      },
    ]);
    expect(buildPainted(existing, 'lake', [a, b, c], OPTS)?.item.id).toBe(
      'lake-2',
    );
  });
});
