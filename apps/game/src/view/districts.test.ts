import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '@overpass-game/render-style';
import { type FenceEdge, type Grid } from '@overpass-game/sim';
import { lockedTileRects } from './districts.ts';

const grid = {
  cols: 5,
  rows: 4,
  terrain: new Array<number>(20).fill(0),
} as Grid;

function edge(
  left: number,
  top: number,
  right: number,
  bottom: number,
): FenceEdge {
  return { left, top, right, bottom };
}

function areaInTiles(rects: { w: number; h: number }[]): number {
  return rects.reduce((n, r) => n + (r.w * r.h) / (TILE_SIZE * TILE_SIZE), 0);
}

describe('lockedTileRects', () => {
  it('dims nothing when the edge covers the whole grid', () => {
    expect(lockedTileRects(grid, edge(0, 0, 5, 4))).toEqual([]);
  });

  it('dims the land beyond an edge in the corner', () => {
    expect(lockedTileRects(grid, edge(0, 0, 2, 2))).toEqual([
      { x: 0, y: 2 * TILE_SIZE, w: 5 * TILE_SIZE, h: 2 * TILE_SIZE },
      { x: 2 * TILE_SIZE, y: 0, w: 3 * TILE_SIZE, h: 2 * TILE_SIZE },
    ]);
  });

  it('covers every tile outside an edge in the middle, and no tile inside it', () => {
    const rects = lockedTileRects(grid, edge(1, 1, 3, 3));
    expect(rects).toHaveLength(4);
    expect(areaInTiles(rects)).toBe(20 - 4);
  });

  it('follows an edge that sits part-way across a tile', () => {
    const rects = lockedTileRects(grid, edge(0, 0, 2.5, 4));
    expect(areaInTiles(rects)).toBeCloseTo(20 - 2.5 * 4, 10);
  });
});
