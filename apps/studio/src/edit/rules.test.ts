import type { SourceMap } from '@overpass-game/map-schema';
import { describe, expect, it } from 'vitest';
import {
  centreFence,
  clampFence,
  clearPace,
  dragFence,
  paceOverrides,
  pickFence,
  setFence,
  setPace,
} from './rules.ts';

const FENCE = { col: 10, row: 8, cols: 24, rows: 14 };

const blank = (): SourceMap =>
  ({
    grid: { cols: 64, rows: 48, fence: { ...FENCE } },
    rules: [{ kind: 'allowedOffers', options: ['bridge'] }],
  }) as unknown as SourceMap;

describe('the starting fence', () => {
  it('stays whole tiles, at least one tile, inside the grid', () => {
    expect(
      clampFence({ col: -3, row: 2.4, cols: 0, rows: 99 }, 64, 48),
    ).toEqual({ col: 0, row: 0, cols: 1, rows: 48 });
    expect(
      clampFence({ col: 60, row: 40, cols: 10, rows: 10 }, 64, 48),
    ).toEqual({ col: 54, row: 38, cols: 10, rows: 10 });
  });

  it('leaves the map as it was when the fence does not change', () => {
    const map = blank();
    expect(setFence(map, { ...FENCE })).toBe(map);
    expect(setFence(map, { ...FENCE, cols: 30 }).grid.fence.cols).toBe(30);
  });

  it('centres in the grid, keeping its size', () => {
    expect(centreFence(blank()).grid.fence).toEqual({
      col: 20,
      row: 17,
      cols: 24,
      rows: 14,
    });
  });

  it('is picked by its edges and corners to resize, and inside to move', () => {
    expect(pickFence(FENCE, { x: 20, y: 15 }, 0.5)).toBe('move');
    expect(pickFence(FENCE, { x: 20, y: 8.2 }, 0.5)).toBe('n');
    expect(pickFence(FENCE, { x: 34.3, y: 15 }, 0.5)).toBe('e');
    expect(pickFence(FENCE, { x: 10, y: 22 }, 0.5)).toBe('sw');
    expect(pickFence(FENCE, { x: 2, y: 2 }, 0.5)).toBeNull();
  });

  it('moves in whole tiles and stays in the grid', () => {
    const from = { x: 20, y: 15 };
    expect(
      dragFence(FENCE, 'move', from, { x: 22.6, y: 14.2 }, 64, 48),
    ).toEqual({ col: 13, row: 7, cols: 24, rows: 14 });
    expect(dragFence(FENCE, 'move', from, { x: -50, y: 99 }, 64, 48)).toEqual({
      col: 0,
      row: 34,
      cols: 24,
      rows: 14,
    });
  });

  it('resizes from an edge or corner, keeping the opposite side and at least one tile', () => {
    expect(
      dragFence(FENCE, 'se', { x: 34, y: 22 }, { x: 38, y: 25 }, 64, 48),
    ).toEqual({ col: 10, row: 8, cols: 28, rows: 17 });
    expect(
      dragFence(FENCE, 'w', { x: 10, y: 15 }, { x: 60, y: 15 }, 64, 48),
    ).toEqual({ col: 33, row: 8, cols: 1, rows: 14 });
    expect(
      dragFence(FENCE, 'n', { x: 20, y: 8 }, { x: 20, y: -9 }, 64, 48),
    ).toEqual({ col: 10, row: 0, cols: 24, rows: 22 });
  });
});

describe('the map pace', () => {
  it('stores only the settings the author sets, next to the other rules', () => {
    const map = setPace(setPace(blank(), 'colours', 3), 'startRoads', 45);
    expect(paceOverrides(map)).toEqual({ colours: 3, startRoads: 45 });
    expect(map.rules).toEqual([
      { kind: 'allowedOffers', options: ['bridge'] },
      { kind: 'pace', colours: 3, startRoads: 45 },
    ]);
  });

  it('keeps values inside their ranges, whole where they count things', () => {
    const map = setPace(setPace(blank(), 'colours', 9), 'demandPace', 1.234);
    expect(paceOverrides(map)).toEqual({ colours: 4, demandPace: 1.23 });
    expect(paceOverrides(setPace(blank(), 'arrivalsPerWeek', 1.6))).toEqual({
      arrivalsPerWeek: 2,
    });
  });

  it('returns a setting to the default, and drops the rule when none is left', () => {
    const one = setPace(blank(), 'colours', 2);
    const none = setPace(one, 'colours', undefined);
    expect(none.rules).toEqual([
      { kind: 'allowedOffers', options: ['bridge'] },
    ]);
    expect(setPace(none, 'colours', undefined)).toBe(none);
    expect(clearPace(setPace(one, 'startRoads', 50)).rules).toEqual([
      { kind: 'allowedOffers', options: ['bridge'] },
    ]);
  });
});
