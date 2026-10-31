import {
  MAP_SCHEMA_VERSION,
  parseSourceMap,
  type SourceMap,
} from '@overpass-game/map-schema';
import { frameBBox, type Frame } from '../geo/frame.ts';
import type { ImportedLayers } from './convert.ts';

/** A URL-safe map id from a place name. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'map' : slug;
}

export interface BuildInput {
  readonly name: string;
  readonly frame: Frame;
  readonly layers: ImportedLayers;
  readonly queryHash: string;
  readonly fetchedAt: string;
}

/** Assembles a source map from imported layers. The result is validated against the schema. */
export function buildSourceMap(input: BuildInput): SourceMap {
  const { frame, layers } = input;
  return parseSourceMap({
    schemaVersion: MAP_SCHEMA_VERSION,
    id: slugify(input.name),
    name: input.name,
    region: { bbox: frameBBox(frame), rotationDeg: frame.rotationDeg },
    grid: { cols: frame.cols, rows: frame.rows, districts: [] },
    layers: {
      water: layers.water,
      mountains: [],
      parks: layers.parks,
      spawnZones: [],
      motorwayGuide: layers.motorwayGuide,
      starterRoads: [],
    },
    rules: [],
    palette: 'default',
    attribution: '© OpenStreetMap contributors (ODbL)',
    osmImport: { fetchedAt: input.fetchedAt, queryHash: input.queryHash },
  });
}
