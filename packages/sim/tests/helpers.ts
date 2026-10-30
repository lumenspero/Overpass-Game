import {
  createGrid,
  type Grid,
  tileIndex,
  Terrain,
  type TerrainKind,
} from '../src/index.ts';

export function makeGrid(
  cols: number,
  rows: number,
  blocked: Array<[number, number, TerrainKind]> = [],
): Grid {
  const grid = createGrid(cols, rows, Terrain.Land);
  for (const [x, y, kind] of blocked)
    grid.terrain[tileIndex(grid, x, y)] = kind;
  return grid;
}

export function at(grid: Grid, x: number, y: number): number {
  return tileIndex(grid, x, y);
}
