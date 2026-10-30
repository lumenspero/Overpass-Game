import { TILE_SIZE } from '@overpass-game/render-style';
import { createGrid, WEEK_TICKS } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { lockedTileRects } from './districts.ts';

describe('lockedTileRects', () => {
  const grid = createGrid(3, 1);
  const districts = [0, 1, 2];

  it('dims every tile outside the open districts', () => {
    // Week 1: only district 0 is open.
    expect(lockedTileRects(grid, districts, 0)).toEqual([
      { x: TILE_SIZE, y: 0, w: TILE_SIZE, h: TILE_SIZE },
      { x: 2 * TILE_SIZE, y: 0, w: TILE_SIZE, h: TILE_SIZE },
    ]);
  });

  it('dims less as districts open', () => {
    // Week 3: district 1 opens, so only district 2 stays dim.
    expect(lockedTileRects(grid, districts, 2 * WEEK_TICKS)).toEqual([
      { x: 2 * TILE_SIZE, y: 0, w: TILE_SIZE, h: TILE_SIZE },
    ]);
  });

  it('dims nothing once every district is open', () => {
    expect(lockedTileRects(grid, districts, 5 * WEEK_TICKS)).toEqual([]);
  });
});
