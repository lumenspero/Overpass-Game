import { addLink, type Grid, type Links } from '@overpass-game/sim';
import type { TileXY } from '../input/path.ts';

/**
 * Road state and links for a crossing's path, so the normal road drawing can show it as a
 * translucent preview while the player drags. Tiles off the map are skipped.
 */
export function previewRoads(
  grid: Grid,
  path: readonly TileXY[],
): { roads: number[]; links: Links } {
  const roads = new Array<number>(grid.cols * grid.rows).fill(0);
  const links: Links = {};
  const inside = (t: TileXY): boolean =>
    t.x >= 0 && t.y >= 0 && t.x < grid.cols && t.y < grid.rows;
  const index = (t: TileXY): number => t.y * grid.cols + t.x;
  const tiles = path.filter(inside);
  for (const t of tiles) roads[index(t)] = 1;
  for (let k = 1; k < tiles.length; k++) {
    addLink(links, index(tiles[k - 1]), index(tiles[k]));
  }
  return { roads, links };
}
