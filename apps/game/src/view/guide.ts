import { TILE_SIZE } from '@overpass-game/render-style';

export interface GridPoint {
  x: number;
  y: number;
}

/**
 * Scales guide lines from grid units to world pixels. The guide is stored as drawn polylines
 * in grid units (see map-compiler's clipPolyline), so each point is multiplied by the tile size.
 */
export function guideWorldLines(
  lines: GridPoint[][],
  tileSize: number = TILE_SIZE,
): GridPoint[][] {
  return lines.map((line) =>
    line.map((p) => ({ x: p.x * tileSize, y: p.y * tileSize })),
  );
}
