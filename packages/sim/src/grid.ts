/** Terrain kinds. A const object, not an enum, so the code stays erasable-syntax only. */
export const Terrain = {
  Land: 0,
  Water: 1,
  Mountain: 2,
  Park: 3,
  OutOfBounds: 4,
} as const;

export type TerrainKind = (typeof Terrain)[keyof typeof Terrain];

/** Tiles are stored row by row: index = y * cols + x. */
export interface Grid {
  cols: number;
  rows: number;
  terrain: TerrainKind[];
}

export function createGrid(
  cols: number,
  rows: number,
  fill: TerrainKind = Terrain.Land,
): Grid {
  return {
    cols,
    rows,
    terrain: new Array<TerrainKind>(cols * rows).fill(fill),
  };
}

export function tileIndex(grid: Grid, x: number, y: number): number {
  return y * grid.cols + x;
}

export function isInBounds(grid: Grid, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < grid.cols * grid.rows;
}

/** Roads may be placed on land and parks. Water and mountains block roads until M5. */
export function isBuildable(grid: Grid, index: number): boolean {
  if (!isInBounds(grid, index)) return false;
  const t = grid.terrain[index];
  return t === Terrain.Land || t === Terrain.Park;
}

/** The up-to-four orthogonal neighbours of a tile that lie inside the grid. */
export function neighbors(grid: Grid, index: number): number[] {
  const x = index % grid.cols;
  const y = Math.floor(index / grid.cols);
  const result: number[] = [];
  if (x > 0) result.push(index - 1);
  if (x < grid.cols - 1) result.push(index + 1);
  if (y > 0) result.push(index - grid.cols);
  if (y < grid.rows - 1) result.push(index + grid.cols);
  return result;
}
