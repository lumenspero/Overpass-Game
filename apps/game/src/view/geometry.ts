import { ROAD_WIDTH_TILES, TILE_SIZE } from '@overpass-game/render-style';
import { type Grid, Terrain, type TerrainKind } from '@overpass-game/sim';

/**
 * Drawing geometry derived from sim state. Pure: no Phaser, so it is unit-tested
 * directly. World units, one tile = TILE_SIZE.
 */

export type RoadShape =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number };

/**
 * Shapes that cover every road tile. Each tile gets a disc at its centre, which
 * rounds every end, junction and corner. Each pair of orthogonally adjacent road
 * tiles gets a bar between their centres, the same width as the disc diameter.
 * Filled opaquely, the union looks like one rounded road network.
 */
export function roadShapes(grid: Grid, roads: readonly number[]): RoadShape[] {
  const r = (ROAD_WIDTH_TILES * TILE_SIZE) / 2;
  const out: RoadShape[] = [];
  for (let i = 0; i < roads.length; i++) {
    if (roads[i] !== 1) continue;
    const x = i % grid.cols;
    const y = Math.floor(i / grid.cols);
    const cx = (x + 0.5) * TILE_SIZE;
    const cy = (y + 0.5) * TILE_SIZE;
    out.push({ kind: 'circle', x: cx, y: cy, r });
    // Bars go right and down only, so each adjacent pair is drawn once.
    if (x + 1 < grid.cols && roads[i + 1] === 1) {
      out.push({ kind: 'rect', x: cx, y: cy - r, w: TILE_SIZE, h: 2 * r });
    }
    if (y + 1 < grid.rows && roads[i + grid.cols] === 1) {
      out.push({ kind: 'rect', x: cx - r, y: cy, w: 2 * r, h: TILE_SIZE });
    }
  }
  return out;
}

export interface TerrainTile {
  x: number;
  y: number;
  kind: Exclude<TerrainKind, typeof Terrain.Land | typeof Terrain.OutOfBounds>;
}

/** Top-left world position of every non-land tile. Land is the map background. */
export function terrainTiles(grid: Grid): TerrainTile[] {
  const out: TerrainTile[] = [];
  for (let i = 0; i < grid.terrain.length; i++) {
    const kind = grid.terrain[i];
    if (kind === Terrain.Land || kind === Terrain.OutOfBounds) continue;
    out.push({
      x: (i % grid.cols) * TILE_SIZE,
      y: Math.floor(i / grid.cols) * TILE_SIZE,
      kind,
    });
  }
  return out;
}
