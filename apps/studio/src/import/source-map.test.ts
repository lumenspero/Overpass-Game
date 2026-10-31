import { describe, expect, it } from 'vitest';
import { parseSourceMap } from '@overpass-game/map-schema';
import { frameAt, frameBBox } from '../geo/frame.ts';
import { buildSourceMap, slugify } from './source-map.ts';

const frame = frameAt([-95.99, 36.15], 40, 30, 15);

describe('slugify', () => {
  it('makes a URL-safe id from a place name', () => {
    expect(slugify('Tulsa, Oklahoma, United States')).toBe(
      'tulsa-oklahoma-united-states',
    );
  });

  it('falls back to "map" when nothing usable is left', () => {
    expect(slugify('!!!')).toBe('map');
  });
});

describe('buildSourceMap', () => {
  const map = buildSourceMap({
    name: 'Tulsa',
    frame,
    layers: { water: [], parks: [], motorwayGuide: [] },
    queryHash: 'abcd1234',
    fetchedAt: '2026-10-31T12:00:00.000Z',
  });

  it('passes the source map schema', () => {
    expect(() => parseSourceMap(map)).not.toThrow();
  });

  it('records the frame as the region and grid', () => {
    expect(map.id).toBe('tulsa');
    expect(map.region.bbox).toEqual(frameBBox(frame));
    expect(map.region.rotationDeg).toBe(15);
    expect(map.grid.cols).toBe(40);
    expect(map.grid.rows).toBe(30);
  });

  it('records where the data came from', () => {
    expect(map.osmImport).toEqual({
      fetchedAt: '2026-10-31T12:00:00.000Z',
      queryHash: 'abcd1234',
    });
    expect(map.attribution).toContain('OpenStreetMap');
  });
});
