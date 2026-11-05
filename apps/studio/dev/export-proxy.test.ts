import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCompiledMap, parseSourceMap } from '@overpass-game/map-schema';
import { exportMap } from './export-proxy.ts';

function sourceMap(id: string) {
  return parseSourceMap({
    schemaVersion: 2,
    id,
    name: 'Tulsa',
    region: { bbox: [-96.1, 36.0, -95.8, 36.3], rotationDeg: 0 },
    grid: { cols: 16, rows: 16, fence: { col: 0, row: 0, cols: 16, rows: 16 } },
    layers: {
      water: [],
      mountains: [],
      parks: [],
      spawnZones: [],
      motorwayGuide: [],
      starterRoads: [],
    },
    rules: [],
    palette: 'default',
    attribution: 'test',
  });
}

describe('exportMap', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'studio-export-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const options = () => ({ mapsDir: dir, gameUrl: 'http://localhost:5173/' });

  it('writes the source and compiled files and returns the play link', () => {
    const out = exportMap(JSON.stringify(sourceMap('tulsa')), options());
    expect(out.status).toBe(200);
    expect(out.body).toEqual({
      id: 'tulsa',
      file: 'maps/tulsa.map.json',
      playUrl: 'http://localhost:5173/?map=tulsa',
    });
    expect(readdirSync(dir).sort()).toEqual([
      'tulsa.map-src.json',
      'tulsa.map.json',
    ]);
    const compiled = parseCompiledMap(
      JSON.parse(readFileSync(join(dir, 'tulsa.map.json'), 'utf8')),
    );
    expect(compiled.cols).toBe(16);
  });

  it('refuses the reserved test id and writes nothing', () => {
    const out = exportMap(JSON.stringify(sourceMap('test')), options());
    expect(out.status).toBe(400);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('rejects text that is not a valid map and writes nothing', () => {
    expect(exportMap('not json', options()).status).toBe(400);
    expect(exportMap('{"id":"x"}', options()).status).toBe(400);
    expect(readdirSync(dir)).toEqual([]);
  });
});
