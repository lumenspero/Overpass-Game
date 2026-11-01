import { describe, expect, it } from 'vitest';
import { parseSourceMap, type SourceMap } from '@overpass-game/map-schema';
import { draftKey, isDraftKey, makeDraft, readDraft } from './draft.ts';

function sampleMap(): SourceMap {
  return parseSourceMap({
    schemaVersion: 1,
    id: 'tulsa',
    name: 'Tulsa',
    region: { bbox: [-96.1, 36.0, -95.8, 36.3], rotationDeg: 0 },
    grid: { cols: 16, rows: 16, districts: [] },
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
    attribution: '© test',
  });
}

const frame = {
  centre: [1, 2] as [number, number],
  cols: 16,
  rows: 16,
  rotationDeg: 30,
};

describe('drafts', () => {
  it('round-trips a draft, including its elevation', () => {
    const draft = makeDraft({
      placeName: 'Tulsa',
      frame,
      mountainThreshold: 500,
      elevation: new Float32Array([1, 2, 3]),
      map: sampleMap(),
    });
    const back = readDraft(draft);
    expect(back?.placeName).toBe('Tulsa');
    expect(back?.frame).toEqual(frame);
    expect(back?.mountainThreshold).toBe(500);
    expect(back?.map.id).toBe('tulsa');
    expect(Array.from(back?.elevation ?? [])).toEqual([1, 2, 3]);
  });

  it('reads nothing, a wrong version or a bad map as null', () => {
    expect(readDraft(undefined)).toBeNull();
    expect(readDraft({ version: 99 })).toBeNull();
    const draft = makeDraft({
      placeName: 'Tulsa',
      frame,
      mountainThreshold: 500,
      elevation: null,
      map: sampleMap(),
    });
    expect(
      readDraft({ ...draft, version: 1, map: { schemaVersion: 1 } }),
    ).toBeNull();
  });

  it('keys each draft by its map id', () => {
    expect(draftKey('tulsa')).toBe('draft:tulsa');
    expect(isDraftKey('draft:tulsa')).toBe(true);
    expect(isDraftKey('osm:abc')).toBe(false);
  });
});
