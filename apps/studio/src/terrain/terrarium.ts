import { METRES_PER_TILE } from '../config.ts';
import {
  frameCornersMercator,
  rotateVector,
  type Frame,
} from '../geo/frame.ts';
import type { Metres } from '../geo/mercator.ts';

/** Terrarium tiles are 256 pixels square. */
export const TILE_PIXELS = 256;

/** Width of the Web Mercator world in metres. The tiles at zoom 0 cover all of it. */
const WORLD_METRES = 2 * Math.PI * 6378137;

export interface TileIndex {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** Decoded elevation for one tile, row-major from its top-left pixel, in metres. */
export interface ElevationTile extends TileIndex {
  readonly metres: Float32Array;
}

/** Decodes one Terrarium pixel to metres. Red and green hold the whole part, blue the fraction. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

export function tileKey({ z, x, y }: TileIndex): string {
  return `${z}/${x}/${y}`;
}

function clampTo(n: number, count: number): number {
  return Math.min(count - 1, Math.max(0, n));
}

/** The tile that holds a Mercator point at a zoom level. Row 0 is the northern edge. */
export function tileOf([mx, my]: Metres, z: number): TileIndex {
  const count = 2 ** z;
  const tileMetres = WORLD_METRES / count;
  return {
    z,
    x: clampTo(Math.floor((mx + WORLD_METRES / 2) / tileMetres), count),
    y: clampTo(Math.floor((WORLD_METRES / 2 - my) / tileMetres), count),
  };
}

/** Every tile a frame touches at a zoom level. */
export function tilesCovering(frame: Frame, z: number): TileIndex[] {
  const corners = frameCornersMercator(frame).map((c) => tileOf(c, z));
  const x0 = Math.min(...corners.map((t) => t.x));
  const x1 = Math.max(...corners.map((t) => t.x));
  const y0 = Math.min(...corners.map((t) => t.y));
  const y1 = Math.max(...corners.map((t) => t.y));
  const tiles: TileIndex[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) tiles.push({ z, x, y });
  return tiles;
}

/** Elevation at a Mercator point, from the nearest pixel of its tile. NaN when the tile is not loaded. */
export function elevationAt(
  tiles: ReadonlyMap<string, ElevationTile>,
  point: Metres,
  z: number,
): number {
  const index = tileOf(point, z);
  const tile = tiles.get(tileKey(index));
  if (!tile) return Number.NaN;
  const tileMetres = WORLD_METRES / 2 ** z;
  const fx = (point[0] + WORLD_METRES / 2) / tileMetres - index.x;
  const fy = (WORLD_METRES / 2 - point[1]) / tileMetres - index.y;
  const px = clampTo(Math.floor(fx * TILE_PIXELS), TILE_PIXELS);
  const py = clampTo(Math.floor(fy * TILE_PIXELS), TILE_PIXELS);
  return tile.metres[py * TILE_PIXELS + px] ?? Number.NaN;
}

/**
 * Elevation at the centre of every grid tile, row-major (index = row * cols + col),
 * following the frame's turn. Tiles that are not loaded give NaN.
 */
export function elevationGrid(
  frame: Frame,
  tiles: ReadonlyMap<string, ElevationTile>,
  z: number,
): Float32Array {
  const out = new Float32Array(frame.cols * frame.rows);
  for (let row = 0; row < frame.rows; row++) {
    for (let col = 0; col < frame.cols; col++) {
      const u = (col + 0.5 - frame.cols / 2) * METRES_PER_TILE;
      const v = (frame.rows / 2 - (row + 0.5)) * METRES_PER_TILE;
      const [dx, dy] = rotateVector([u, v], frame.rotationDeg);
      out[row * frame.cols + col] = elevationAt(
        tiles,
        [frame.centre[0] + dx, frame.centre[1] + dy],
        z,
      );
    }
  }
  return out;
}
