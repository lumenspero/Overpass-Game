import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MapFormatError,
  PACKAGE_NAME,
  parseCompiledMap,
  parseSourceMap,
  MapLabelSchema,
} from '../src/index.ts';

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const testSource = (): unknown => readJson('../../../maps/test.map-src.json');

describe('@overpass-game/map-schema', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@overpass-game/map-schema');
  });

  it('accepts the test map source', () => {
    expect(() => parseSourceMap(testSource())).not.toThrow();
  });

  it('names the bad field when a stroke has no width', () => {
    const src = testSource() as {
      layers: { water: { kind: string; width?: number; id: string }[] };
    };
    src.layers.water[0] = {
      ...src.layers.water[0],
      kind: 'strokeSpline',
    };
    expect(() => parseSourceMap(src)).toThrow(MapFormatError);
    try {
      parseSourceMap(src);
    } catch (err) {
      expect((err as MapFormatError).issues).toContain(
        'layers.water.0.width: a stroke needs a width',
      );
    }
  });

  it('rejects a closed shape with fewer than three points', () => {
    const src = testSource() as {
      layers: { parks: { points: unknown[] }[] };
    };
    src.layers.parks[0].points = src.layers.parks[0].points.slice(0, 2);
    expect(() => parseSourceMap(src)).toThrow(/at least 3 points/);
  });

  it('rejects a source map with a wrong schema version', () => {
    const src = { ...(testSource() as object), schemaVersion: 2 };
    expect(() => parseSourceMap(src)).toThrow(/schemaVersion/);
  });

  it('rejects a compiled map whose terrain does not cover the grid', () => {
    const map = {
      schemaVersion: 1,
      id: 'tiny',
      name: 'Tiny',
      cols: 2,
      rows: 2,
      terrain: [0, 0, 0],
      districts: [0, 0, 0, 0],
      spawnWeights: [0, 0, 0, 0],
      outlines: { water: [], mountains: [], parks: [] },
      motorwayGuide: [],
      starterRoads: [],
      rules: [],
      palette: 'default',
      attribution: 'test',
      contentHash: '00000000',
    };
    expect(() => parseCompiledMap(map)).toThrow(/expected 4 entries/);
  });

  it('rejects a path whose tiles do not touch', () => {
    const map = {
      schemaVersion: 1,
      id: 'tiny',
      name: 'Tiny',
      cols: 3,
      rows: 3,
      terrain: new Array<number>(9).fill(0),
      districts: new Array<number>(9).fill(0),
      spawnWeights: new Array<number>(9).fill(0),
      outlines: { water: [], mountains: [], parks: [] },
      motorwayGuide: [],
      starterRoads: [[0, 8]],
      rules: [],
      palette: 'default',
      attribution: 'test',
      contentHash: '00000000',
    };
    expect(() => parseCompiledMap(map)).toThrow(/does not touch/);
  });
});

describe('map labels', () => {
  it('accepts a park, mountain or water label', () => {
    for (const kind of ['park', 'mountain', 'water'] as const) {
      expect(() =>
        MapLabelSchema.parse({
          id: 'l1',
          kind,
          text: 'Riverside Park',
          x: 4,
          y: 5,
          size: 1.2,
        }),
      ).not.toThrow();
    }
  });

  it('rejects an unknown kind, empty text and a non-positive size', () => {
    expect(() =>
      MapLabelSchema.parse({
        id: 'l1',
        kind: 'road',
        text: 'A',
        x: 0,
        y: 0,
        size: 1,
      }),
    ).toThrow();
    expect(() =>
      MapLabelSchema.parse({
        id: 'l1',
        kind: 'park',
        text: '   ',
        x: 0,
        y: 0,
        size: 1,
      }),
    ).toThrow();
    expect(() =>
      MapLabelSchema.parse({
        id: 'l1',
        kind: 'park',
        text: 'A',
        x: 0,
        y: 0,
        size: 0,
      }),
    ).toThrow();
  });
});
