import { toSimMap } from '@overpass-game/map-compiler';
import { type CompiledMap, parseCompiledMap } from '@overpass-game/map-schema';
import { type Grid, type MapRule, type Side } from '@overpass-game/sim';
// The test map is compiled from maps/test.map-src.json by `pnpm compile-maps`.
import testMapJson from '../../../../maps/test.map.json';

/**
 * Hand-made test map. Not a real city: it exists so the renderer, input and
 * sim rules have something to work on. Its terrain and districts come from the
 * compiled file; buildings are still listed here until the spawn field (M14) places them.
 */
export const TEST_MAP: CompiledMap = parseCompiledMap(testMapJson);
export const TEST_MAP_COLS = TEST_MAP.cols;
export const TEST_MAP_ROWS = TEST_MAP.rows;

export interface TestBuilding {
  kind: 'house' | 'destination';
  color: number;
  col: number;
  row: number;
  entrance: Side;
}

/**
 * Three colour pairs, all on the land west of the river. Each pair can connect by land
 * (checked in the tests). Pair 0 opens across two districts; pair 1 is open from the start;
 * pair 2 sits in district 1, which opens at week 3.
 */
export const TEST_BUILDINGS: TestBuilding[] = [
  { kind: 'house', color: 0, col: 8, row: 6, entrance: 'e' },
  { kind: 'destination', color: 0, col: 12, row: 11, entrance: 'n' },
  { kind: 'house', color: 1, col: 7, row: 1, entrance: 's' },
  { kind: 'destination', color: 1, col: 4, row: 14, entrance: 'n' },
  { kind: 'house', color: 2, col: 11, row: 2, entrance: 'e' },
  { kind: 'destination', color: 2, col: 13, row: 6, entrance: 'w' },
];

/**
 * The district of each tile, from the compiled map (spec: Expansion). The grid argument is
 * kept so callers read the same as before; the districts always come from the map file.
 */
export function buildTestDistricts(): number[] {
  return TEST_MAP.districts.slice();
}

/** A fresh grid for the test map, built from the compiled file. */
export function buildTestGrid(): Grid {
  return toSimMap(TEST_MAP).grid;
}

/** The test map's rules, passed to the sim (spec: Destination upgrades, growth and rule hooks). */
export function testMapRules(): MapRule[] {
  return toSimMap(TEST_MAP).rules;
}

/** The test map's motorway guide: clipped lines in grid units, for the guide overlay. */
export function testMapGuide(): { x: number; y: number }[][] {
  return TEST_MAP.motorwayGuide;
}
