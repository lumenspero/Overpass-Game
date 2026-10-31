import { TERRAIN_PATH } from '../../dev/terrain-proxy.ts';
import type { Frame } from '../geo/frame.ts';
import {
  TILE_PIXELS,
  decodeTerrarium,
  tileKey,
  tilesCovering,
  type ElevationTile,
  type TileIndex,
} from './terrarium.ts';

/** Fetches and decodes every terrain tile a frame touches. Throws if any tile fails. */
export async function loadTerrain(
  frame: Frame,
  z: number,
): Promise<Map<string, ElevationTile>> {
  const tiles = await Promise.all(
    tilesCovering(frame, z).map((index) => fetchTile(index)),
  );
  return new Map(
    tiles.map((tile): [string, ElevationTile] => [tileKey(tile), tile]),
  );
}

async function fetchTile(index: TileIndex): Promise<ElevationTile> {
  const res = await fetch(
    `${TERRAIN_PATH}/terrarium/${index.z}/${index.x}/${index.y}.png`,
  );
  if (!res.ok)
    throw new Error(
      `Terrain tile ${tileKey(index)} failed (HTTP ${res.status}).`,
    );
  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: 'none',
  });
  const canvas = new OffscreenCanvas(TILE_PIXELS, TILE_PIXELS);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot decode terrain tiles.');
  ctx.drawImage(bitmap, 0, 0, TILE_PIXELS, TILE_PIXELS);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, TILE_PIXELS, TILE_PIXELS);
  const metres = new Float32Array(TILE_PIXELS * TILE_PIXELS);
  for (let i = 0; i < metres.length; i++) {
    metres[i] = decodeTerrarium(
      data[i * 4] ?? 0,
      data[i * 4 + 1] ?? 0,
      data[i * 4 + 2] ?? 0,
    );
  }
  return { ...index, metres };
}
