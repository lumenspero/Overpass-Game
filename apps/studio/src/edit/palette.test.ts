import { describe, expect, it } from 'vitest';
import type { SourceMap } from '@overpass-game/map-schema';
import { setPalette, setWaterPalette } from './ops.ts';

const blank = (): SourceMap =>
  ({
    palette: 'white',
    waterPalette: 'shared',
    rules: [],
  }) as unknown as SourceMap;

describe('palette choices on a Studio map', () => {
  it('stores an approved terrain palette and water choice', () => {
    const map = setWaterPalette(setPalette(blank(), 'indigo'), 'blue');
    expect(map.palette).toBe('indigo');
    expect(map.waterPalette).toBe('blue');
  });

  it('returns the same map when the choice does not change', () => {
    const map = blank();
    expect(setPalette(map, 'white')).toBe(map);
    expect(setWaterPalette(map, 'shared')).toBe(map);
  });
});
