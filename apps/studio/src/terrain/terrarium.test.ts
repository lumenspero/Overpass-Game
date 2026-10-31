import { describe, expect, it } from 'vitest';
import { frameAt } from '../geo/frame.ts';
import { lonLatToMercator } from '../geo/mercator.ts';
import {
  TILE_PIXELS,
  decodeTerrarium,
  elevationAt,
  elevationGrid,
  tileKey,
  tileOf,
  tilesCovering,
  type ElevationTile,
  type TileIndex,
} from './terrarium.ts';

function flat(index: TileIndex, metres: number): ElevationTile {
  return {
    ...index,
    metres: new Float32Array(TILE_PIXELS * TILE_PIXELS).fill(metres),
  };
}

describe('decodeTerrarium', () => {
  it('reads sea level from the offset', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
  });

  it('adds the green channel in metres', () => {
    expect(decodeTerrarium(128, 1, 0)).toBe(1);
  });

  it('adds the red channel in 256 m steps', () => {
    expect(decodeTerrarium(129, 0, 0)).toBe(256);
  });

  it('reads the blue channel as fractions of a metre', () => {
    expect(decodeTerrarium(128, 0, 128)).toBe(0.5);
  });
});

describe('tileOf', () => {
  it('finds the quarter of the world a point is in at zoom 1', () => {
    expect(tileOf(lonLatToMercator([-90, 45]), 1)).toEqual({
      z: 1,
      x: 0,
      y: 0,
    });
    expect(tileOf(lonLatToMercator([90, -45]), 1)).toEqual({
      z: 1,
      x: 1,
      y: 1,
    });
  });

  it('finds the column of Tulsa at zoom 10', () => {
    expect(tileOf(lonLatToMercator([-95.99, 36.15]), 10).x).toBe(238);
  });
});

describe('tilesCovering', () => {
  it('includes the tile under the frame centre', () => {
    const frame = frameAt([-95.99, 36.15], 48, 48, 30);
    const keys = tilesCovering(frame, 10).map(tileKey);
    expect(keys).toContain(tileKey(tileOf(frame.centre, 10)));
  });
});

describe('elevationAt', () => {
  const point = lonLatToMercator([-95.99, 36.15]);

  it('reads the tile that holds the point', () => {
    const tiles = new Map([
      [tileKey(tileOf(point, 10)), flat(tileOf(point, 10), 750)],
    ]);
    expect(elevationAt(tiles, point, 10)).toBe(750);
  });

  it('gives NaN when the tile is not loaded', () => {
    expect(Number.isNaN(elevationAt(new Map(), point, 10))).toBe(true);
  });
});

describe('elevationGrid', () => {
  it('samples every grid tile from the tiles under the frame', () => {
    const frame = frameAt([-95.99, 36.15], 8, 6, 0);
    const tiles = new Map(
      tilesCovering(frame, 10).map((t): [string, ElevationTile] => [
        tileKey(t),
        flat(t, 320),
      ]),
    );
    const grid = elevationGrid(frame, tiles, 10);
    expect(grid).toHaveLength(frame.cols * frame.rows);
    expect(Array.from(grid).every((v) => v === 320)).toBe(true);
  });

  it('gives NaN for every cell when no tile is loaded', () => {
    const frame = frameAt([-95.99, 36.15], 8, 6, 0);
    const grid = elevationGrid(frame, new Map(), 10);
    expect(Array.from(grid).every((v) => Number.isNaN(v))).toBe(true);
  });
});
