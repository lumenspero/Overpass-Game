import { toSimMap } from '@overpass-game/map-compiler';
import { type CompiledMap, parseCompiledMap } from '@overpass-game/map-schema';
import { type Grid, type MapRule, type Side } from '@overpass-game/sim';
// The test map is compiled from maps/test.map-src.json by `pnpm compile-maps`.
import testMapJson from '../../../../maps/test.map.json';

/**
 * Hand-made test map. Not a real city: it exists so the renderer, input and
 * sim rules have something to work on. Its terrain and fence come from the
 * compiled file; buildings are still listed here by hand.
 */
export const TEST_MAP: CompiledMap = parseCompiledMap(testMapJson);
export const TEST_MAP_COLS = TEST_MAP.cols;
export const TEST_MAP_ROWS = TEST_MAP.rows;

let activeMap: CompiledMap | null = null;

/** Sets the map the game plays, or null for the built-in test map. Called once, at start-up. */
export function setActiveMap(map: CompiledMap | null): void {
  activeMap = map;
}

/** The map being played: the one set at start-up, otherwise the test map. */
export function playedMap(): CompiledMap {
  return activeMap ?? TEST_MAP;
}

/** True only for the built-in test map, the one map with hand-placed buildings. */
export function isTestMap(): boolean {
  return activeMap === null;
}

export interface TestBuilding {
  kind: 'house' | 'destination';
  color: number;
  col: number;
  row: number;
  entrance: Side;
}

/**
 * Three colour pairs, all on the land west of the river. Each pair can connect by land
 * (checked in the tests). Pair 1 starts inside the fence; pair 0's destination and pair 2's
 * house start outside it and come inside by week 2.
 */
export const TEST_BUILDINGS: TestBuilding[] = [
  { kind: 'house', color: 0, col: 8, row: 6, entrance: 'e' },
  { kind: 'destination', color: 0, col: 11, row: 8, entrance: 'w' },
  { kind: 'house', color: 1, col: 7, row: 1, entrance: 's' },
  { kind: 'destination', color: 1, col: 9, row: 3, entrance: 'n' },
  { kind: 'house', color: 2, col: 11, row: 2, entrance: 'e' },
  { kind: 'destination', color: 2, col: 9, row: 13, entrance: 'n' },
];

/** The fence the test map starts inside, from the compiled map file (spec: Expansion). */
export function buildTestFence() {
  return { ...playedMap().fence };
}

/** A fresh grid for the test map, built from the compiled file. */
export function buildTestGrid(): Grid {
  return toSimMap(playedMap()).grid;
}

/** The test map's rules, passed to the sim (spec: Destination growth and rule hooks). */
export function testMapRules(): MapRule[] {
  return toSimMap(playedMap()).rules;
}

/** The test map's motorway guide: clipped lines in grid units, for the guide overlay. */
export function testMapGuide(): { x: number; y: number }[][] {
  return playedMap().motorwayGuide;
}
