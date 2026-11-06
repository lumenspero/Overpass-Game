import type { SourceMap } from '@overpass-game/map-schema';
import { describe, expect, it } from 'vitest';
import { MIN_FENCE_TILES, setStartingFence } from './ops.ts';

const blank = (): SourceMap =>
  ({
    grid: { cols: 96, rows: 96, fence: { col: 0, row: 0, cols: 96, rows: 96 } },
    rules: [],
  }) as unknown as SourceMap;

describe('starting fence on a Studio map', () => {
  it('stores a fence that lies inside the grid', () => {
    const map = setStartingFence(blank(), {
      col: 36,
      row: 41,
      cols: 24,
      rows: 14,
    });
    expect(map.grid.fence).toEqual({ col: 36, row: 41, cols: 24, rows: 14 });
  });

  it('refuses a fence that runs past the grid edge', () => {
    const map = blank();
    expect(setStartingFence(map, { col: 90, row: 0, cols: 12, rows: 12 })).toBe(
      map,
    );
    expect(setStartingFence(map, { col: 0, row: 90, cols: 12, rows: 12 })).toBe(
      map,
    );
  });

  it('refuses a fence smaller than the minimum on either side', () => {
    const map = blank();
    const short = MIN_FENCE_TILES - 1;
    expect(
      setStartingFence(map, { col: 0, row: 0, cols: short, rows: 20 }),
    ).toBe(map);
    expect(
      setStartingFence(map, { col: 0, row: 0, cols: 20, rows: short }),
    ).toBe(map);
  });

  it('refuses a fence with a fraction or a negative start', () => {
    const map = blank();
    expect(
      setStartingFence(map, { col: 0.5, row: 0, cols: 20, rows: 20 }),
    ).toBe(map);
    expect(setStartingFence(map, { col: -1, row: 0, cols: 20, rows: 20 })).toBe(
      map,
    );
    expect(
      setStartingFence(map, { col: 0, row: 0, cols: Number.NaN, rows: 20 }),
    ).toBe(map);
  });

  it('returns the same map when the fence does not change', () => {
    const map = setStartingFence(blank(), {
      col: 1,
      row: 1,
      cols: 20,
      rows: 20,
    });
    expect(setStartingFence(map, { col: 1, row: 1, cols: 20, rows: 20 })).toBe(
      map,
    );
  });
});
