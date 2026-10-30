import { BUILDING_COLORS } from '@overpass-game/render-style';
import { DEFAULT_TUNING } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { TUNING_RANGES } from './tuning-ranges.ts';

describe('TUNING_RANGES', () => {
  it('has a range for every tunable value, and nothing else', () => {
    expect(Object.keys(TUNING_RANGES).sort()).toEqual(
      Object.keys(DEFAULT_TUNING).sort(),
    );
  });

  it('gives every value a sensible range that holds its default', () => {
    for (const [key, r] of Object.entries(TUNING_RANGES)) {
      expect(r.step, key).toBeGreaterThan(0);
      expect(r.min, key).toBeLessThan(r.max);
      const value = DEFAULT_TUNING[key as keyof typeof DEFAULT_TUNING];
      expect(value, key).toBeGreaterThanOrEqual(r.min);
      expect(value, key).toBeLessThanOrEqual(r.max);
    }
  });

  it('never offers more building colours than the palette has', () => {
    expect(TUNING_RANGES.BUILDING_COLOR_COUNT.max).toBeLessThanOrEqual(
      BUILDING_COLORS.length,
    );
  });
});
