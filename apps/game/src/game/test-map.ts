import {
  createGrid,
  type Grid,
  type Side,
  Terrain,
  type TerrainKind,
} from '@overpass-game/sim';

/**
 * Hand-made test map. Not a real city: it exists so the renderer, input and
 * sim rules have something to work on. Real maps arrive compiled from M6 onward.
 */
export const TEST_MAP_COLS = 24;
export const TEST_MAP_ROWS = 16;

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
 * The districts that open over time (spec: Expansion). Land west of the river is split:
 * district 0 is columns 0 to 9, district 1 is the top half of columns 10 to 13, and
 * district 2 is the bottom half of them. Land east of the river is district 3, which opens at
 * EXPANSION_WEEK_3; a bridge can reach it after that.
 */
export function buildTestDistricts(grid: Grid): number[] {
  const out = new Array<number>(grid.cols * grid.rows).fill(0);
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      let district = 0;
      if (col >= 14) district = 3;
      else if (col >= 10) district = row < 8 ? 1 : 2;
      out[row * grid.cols + col] = district;
    }
  }
  return out;
}

export function buildTestGrid(): Grid {
  const grid = createGrid(TEST_MAP_COLS, TEST_MAP_ROWS, Terrain.Land);
  const fill = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    kind: TerrainKind,
  ): void => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        grid.terrain[y * grid.cols + x] = kind;
      }
    }
  };
  fill(14, 0, 14, 15, Terrain.Water); // a river the full height of the map
  fill(3, 2, 6, 5, Terrain.Water); // a lake
  fill(18, 10, 21, 13, Terrain.Mountain); // a block of mountain
  fill(2, 9, 8, 12, Terrain.Park); // a park
  return grid;
}
