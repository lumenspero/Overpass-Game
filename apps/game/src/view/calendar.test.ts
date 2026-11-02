import { tuning } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import {
  clockAngle,
  dayIndex,
  dayName,
  dayProgress,
  isPm,
} from './calendar.ts';

/** The tick a given fraction of the way through day `day` falls on. */
const at = (day: number, fraction = 0): number =>
  Math.round(((day + fraction) * tuning.WEEK_TICKS) / 7);

describe('day of the week', () => {
  it('starts on Monday and runs to Sunday', () => {
    expect(dayName(0)).toBe('MON');
    expect(dayName(at(3, 0.5))).toBe('THU');
    expect(dayName(at(6, 0.5))).toBe('SUN');
  });

  it('wraps to Monday at the start of the next week', () => {
    expect(dayName(tuning.WEEK_TICKS)).toBe('MON');
    expect(dayIndex(tuning.WEEK_TICKS + at(2, 0.5))).toBe(2);
  });

  it('gives each day an equal share of the week', () => {
    const counts = new Array<number>(7).fill(0);
    for (let t = 0; t < tuning.WEEK_TICKS; t++) counts[dayIndex(t)] += 1;
    const ideal = tuning.WEEK_TICKS / 7;
    for (const c of counts) expect(Math.abs(c - ideal)).toBeLessThanOrEqual(1);
  });
});

describe('clock', () => {
  it('starts at the top of the dial, in the first half of the day', () => {
    expect(dayProgress(0)).toBe(0);
    expect(clockAngle(0)).toBe(0);
    expect(isPm(0)).toBe(false);
  });

  it('turns twice in a day, so a quarter day is a half turn', () => {
    expect(Math.abs(clockAngle(at(0, 0.25)) - 180)).toBeLessThan(2);
  });

  it('returns to the top at the 12-hour mark, where the second turn begins', () => {
    const angle = clockAngle(at(0, 0.5));
    expect(Math.min(angle, 360 - angle)).toBeLessThan(2);
  });

  it('inverts in the second half of the day, and only then', () => {
    expect(isPm(at(0, 0.25))).toBe(false);
    expect(isPm(at(0, 0.75))).toBe(true);
    expect(isPm(at(5, 0.6))).toBe(true);
  });

  it('keeps the angle in one turn', () => {
    for (let t = 0; t < tuning.WEEK_TICKS; t += 37) {
      const a = clockAngle(t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    }
  });
});
