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

/**
 * Length of a step across a corner, in tile units. A step along an edge is 1.
 * Roads link through both edges and corners, so a corner step is this long.
 */
export const DIAGONAL_STEP = Math.SQRT2;

/** True when two tiles touch only at a corner. */
export function isDiagonal(grid: Grid, a: number, b: number): boolean {
  const dx = (a % grid.cols) - (b % grid.cols);
  const dy = Math.floor(a / grid.cols) - Math.floor(b / grid.cols);
  return Math.abs(dx) === 1 && Math.abs(dy) === 1;
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

/**
 * Every tile that touches `index` by an edge or a corner, inside the grid. Roads
 * connect to all of these, so a diagonal pair of road tiles is connected.
 */
export function linkNeighbors(grid: Grid, index: number): number[] {
  const x = index % grid.cols;
  const y = Math.floor(index / grid.cols);
  const result: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
      result.push(ny * grid.cols + nx);
    }
  }
  return result;
}
