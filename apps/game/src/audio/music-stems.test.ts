import { describe, expect, it } from 'vitest';
import {
  CARS_FOR_FULL_MELODY,
  FULL_STEMS,
  PAD_BASE,
  PINS_FOR_FULL_PERCUSSION,
  stemLevels,
} from './music-stems.ts';
import { WEEK_HOURS } from './week-tick.ts';

const quiet = { cars: 0, pins: 0, overflowing: false, weekHour: 0 };

describe('music stems', () => {
  it('plays every stem at full when the menu has the music', () => {
    expect(FULL_STEMS).toEqual({ pad: 1, melody: 1, percussion: 1 });
  });

  it('keeps the pad under an empty map, and the melody and percussion silent', () => {
    expect(stemLevels(quiet)).toEqual({
      pad: PAD_BASE,
      melody: 0,
      percussion: 0,
    });
  });

  it('brings the pad up through the week, to full on the last hour', () => {
    expect(stemLevels({ ...quiet, weekHour: WEEK_HOURS / 2 }).pad).toBeCloseTo(
      (PAD_BASE + 1) / 2,
    );
    expect(
      stemLevels({ ...quiet, weekHour: WEEK_HOURS - 1 }).pad,
    ).toBeGreaterThan(0.99);
  });

  it('follows traffic with the melody, up to full at the car mark', () => {
    expect(
      stemLevels({ ...quiet, cars: CARS_FOR_FULL_MELODY / 2 }).melody,
    ).toBeCloseTo(0.5);
    expect(
      stemLevels({ ...quiet, cars: CARS_FOR_FULL_MELODY * 3 }).melody,
    ).toBe(1);
  });

  it('follows pin pressure with the percussion, up to full at the pin mark', () => {
    expect(
      stemLevels({ ...quiet, pins: PINS_FOR_FULL_PERCUSSION / 3 }).percussion,
    ).toBeCloseTo(1 / 3);
  });

  it('takes the percussion to full while an overflow is counting down', () => {
    expect(
      stemLevels({ ...quiet, pins: 0, overflowing: true }).percussion,
    ).toBe(1);
  });
});
