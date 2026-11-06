import {
  MAP_SCHEMA_VERSION,
  parseSourceMap,
  type Shape,
  type SourceMap,
} from '@overpass-game/map-schema';
import { trimSource } from '@overpass-game/map-compiler';
import { smoothSource } from './smooth.ts';
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
  /** Mountain outlines from terrain. Empty when terrain was unavailable. */
  readonly mountains?: readonly Shape[];
  readonly queryHash: string;
  readonly fetchedAt: string;
}

/** The starting fence every imported map gets, in tiles. */
export const STARTING_FENCE_TILES = { cols: 24, rows: 14 } as const;

/**
 * The standard starting fence, centred in the frame. A frame smaller than the standard size gets
 * a fence the size of the frame.
 */
export function centredFence(
  cols: number,
  rows: number,
): { col: number; row: number; cols: number; rows: number } {
  const w = Math.min(STARTING_FENCE_TILES.cols, cols);
  const h = Math.min(STARTING_FENCE_TILES.rows, rows);
  return {
    col: Math.floor((cols - w) / 2),
    row: Math.floor((rows - h) / 2),
    cols: w,
    rows: h,
  };
}

/**
 * Assembles a source map from imported layers. The result is validated against the schema, and its
 * shapes are trimmed to the frame and smoothed.
 */
export function buildSourceMap(input: BuildInput): SourceMap {
  const { frame, layers } = input;
  // Imported shapes often run far past the frame; only what the map can show is kept, and what
  // is kept is smoothed to the import detail.
  return smoothSource(
    trimSource(
      parseSourceMap({
        schemaVersion: MAP_SCHEMA_VERSION,
        id: slugify(input.name),
        name: input.name,
        region: { bbox: frameBBox(frame), rotationDeg: frame.rotationDeg },
        grid: {
          cols: frame.cols,
          rows: frame.rows,
          fence: centredFence(frame.cols, frame.rows),
        },
        layers: {
          water: layers.water,
          mountains: input.mountains ?? [],
          parks: layers.parks,
          motorwayGuide: layers.motorwayGuide,
          starterRoads: [],
          labels: layers.labels,
        },
        rules: [],
        palette: 'default',
        waterPalette: 'shared',
        attribution: '© OpenStreetMap contributors (ODbL)',
        osmImport: { fetchedAt: input.fetchedAt, queryHash: input.queryHash },
      }),
    ),
  );
}
