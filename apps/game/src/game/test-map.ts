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

/** Two colour pairs. Each house's entrance faces open land, so a road can connect it. */
export const TEST_BUILDINGS: TestBuilding[] = [
  { kind: 'house', color: 0, col: 8, row: 6, entrance: 'e' },
  { kind: 'destination', color: 0, col: 12, row: 11, entrance: 'n' },
  { kind: 'house', color: 1, col: 20, row: 2, entrance: 's' },
  { kind: 'destination', color: 1, col: 4, row: 14, entrance: 'n' },
];

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
