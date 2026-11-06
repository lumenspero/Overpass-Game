import { readFileSync } from 'node:fs';
import { Terrain } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import {
  clipPolyline,
  compileMap,
  contentHash,
  sampleSpline,
  tilePaths,
  toSimMap,
} from '../src/index.ts';
import {
  type CompiledMap,
  parseCompiledMap,
  parseSourceMap,
  type SourceMap,
} from '@overpass-game/map-schema';
import { PACKAGE_NAME } from '../src/index.ts';

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const loadSource = (path: string): SourceMap => parseSourceMap(readJson(path));

const coast = (): SourceMap => loadSource('./fixtures/coast.map-src.json');
const testSource = (): SourceMap =>
  loadSource('../../../maps/test.map-src.json');

/** One character per tile, row by row: the terrain as a picture for snapshots. */
function terrainAscii(map: CompiledMap): string {
  const glyph = ['.', '~', '^', 'p', ' '];
  const rows: string[] = [];
  for (let y = 0; y < map.rows; y++) {
    let row = '';
    for (let x = 0; x < map.cols; x++) {
      row += glyph[map.terrain[y * map.cols + x]] ?? '?';
    }
    rows.push(row);
  }
  return rows.join('\n');
}

/** The M5 test map, hand-built tile by tile. The compiled file must reproduce it exactly. */
function legacyTestMap(): { terrain: number[] } {
  const cols = 24;
  const rows = 16;
  const terrain = new Array<number>(cols * rows).fill(Terrain.Land);
  const fill = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    kind: number,
  ) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) terrain[y * cols + x] = kind;
    }
  };
  fill(14, 0, 14, 15, Terrain.Water);
  fill(3, 2, 6, 5, Terrain.Water);
  fill(18, 10, 21, 13, Terrain.Mountain);
  fill(2, 9, 8, 12, Terrain.Park);
  return { terrain };
}

describe('@overpass-game/map-compiler', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@overpass-game/map-compiler');
  });

  it('compiles the coast fixture to a valid compiled map', () => {
    expect(() => parseCompiledMap(compileMap(coast()))).not.toThrow();
  });

  it('matches the snapshot for the coast fixture', () => {
    const map = compileMap(coast());
    expect({
      terrain: terrainAscii(map),
      fence: map.fence,
      guide: map.motorwayGuide,
      starterRoads: map.starterRoads,
      waterPaths: map.outlines.water.map((p) => ({
        closed: p.closed,
        width: p.width,
        points: p.points.length,
      })),
      rules: map.rules,
    }).toMatchSnapshot();
  });

  it('gives the test map exactly the terrain of the M5 hand-built grid, and its ten-column fence', () => {
    const map = compileMap(testSource());
    const legacy = legacyTestMap();
    expect(map.terrain).toEqual(legacy.terrain);
    expect(map.fence).toEqual({ col: 0, row: 0, cols: 10, rows: 16 });
  });

  it('keeps the committed maps/test.map.json up to date with its source', () => {
    const committed = readJson('../../../maps/test.map.json');
    expect(committed).toEqual(compileMap(testSource()));
  });

  it('gives the test map a snapshot of its terrain picture', () => {
    expect(terrainAscii(compileMap(testSource()))).toMatchSnapshot();
  });

  it('changes the content hash when a shape moves, and not otherwise', () => {
    const a = compileMap(coast());
    expect(compileMap(coast()).contentHash).toBe(a.contentHash);
    const moved = coast();
    moved.layers.water[0].points[0].x -= 0.5;
    expect(compileMap(moved).contentHash).not.toBe(a.contentHash);
  });

  it('turns a compiled map into the sim grid, fence and rules', () => {
    const map = compileMap(coast());
    const sim = toSimMap(map);
    expect(sim.grid.cols).toBe(14);
    expect(sim.grid.rows).toBe(10);
    expect(sim.grid.terrain).toEqual(map.terrain);
    expect(sim.startFence).toEqual(map.fence);
    expect(sim.rules).toEqual([
      { kind: 'allowedOffers', options: ['bridge', 'tunnel'] },
    ]);
  });

  it('walks a stroke-free guide into one run of adjacent tiles', () => {
    const runs = tilePaths(
      [
        { x: 0.5, y: 0.5 },
        { x: 3.5, y: 2.5 },
      ],
      8,
      8,
    );
    expect(runs).toHaveLength(1);
    const run = runs[0];
    for (let k = 1; k < run.length; k++) {
      const dx = Math.abs((run[k - 1] % 8) - (run[k] % 8));
      const dy = Math.abs(Math.floor(run[k - 1] / 8) - Math.floor(run[k] / 8));
      expect(dx).toBeLessThanOrEqual(1);
      expect(dy).toBeLessThanOrEqual(1);
    }
  });

  it('splits a guide that leaves the grid into separate runs', () => {
    const runs = tilePaths(
      [
        { x: -2, y: 1.5 },
        { x: 6, y: 1.5 },
        { x: 9, y: 1.5 },
      ],
      8,
      4,
    );
    expect(runs).toHaveLength(1);
    expect(runs[0][0]).toBe(1 * 8 + 0);
    expect(runs[0].at(-1)).toBe(1 * 8 + 7);
  });

  it('samples a straight spline between its end points', () => {
    const pts = sampleSpline(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      false,
    );
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts.at(-1)).toEqual({ x: 4, y: 0 });
  });

  it('hashes text to eight hex digits', () => {
    expect(contentHash('abc')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('motorway guide clipping', () => {
  it('keeps a diagonal guide as one straight line, not a staircase', () => {
    const [line] = clipPolyline(
      [
        { x: 0, y: 0 },
        { x: 8, y: 8 },
      ],
      10,
      10,
    );
    // Every point should sit on the diagonal y = x.
    for (const p of line) expect(Math.abs(p.x - p.y)).toBeLessThan(0.02);
  });

  it('clips a guide to the grid and keeps the parts that are inside', () => {
    const runs = clipPolyline(
      [
        { x: -2, y: 1 },
        { x: 6, y: 1 },
        { x: 9, y: 1 },
      ],
      8,
      4,
    );
    expect(runs).toHaveLength(1);
    for (const p of runs[0]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(8);
    }
    expect(runs[0][0].x).toBeCloseTo(0, 1);
    expect(runs[0].at(-1)?.x).toBeCloseTo(8, 1);
  });
});

describe('guide size', () => {
  it('stores a long straight guide as its two end points', () => {
    const [line] = clipPolyline(
      [
        { x: 0, y: 0 },
        { x: 24, y: 16 },
      ],
      24,
      16,
    );
    expect(line).toHaveLength(2);
  });
});
