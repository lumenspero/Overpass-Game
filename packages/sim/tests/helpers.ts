import {
  createGrid,
  type Grid,
  linkTiles,
  placeRoads,
  type SimState,
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

/**
 * Lays roads along a drag: every tile becomes a road, and each step between consecutive
 * tiles becomes a link, as the player's drag does. Tiles must be given in drag order.
 */
export function drawRoads(sim: SimState, tiles: number[]): void {
  placeRoads(sim, tiles);
  for (let i = 1; i < tiles.length; i++) linkTiles(sim, tiles[i - 1], tiles[i]);
}
