import { describe, expect, it } from 'vitest';
import {
  hourOfWeek,
  WEEK_END_TICK_HOURS,
  WEEK_HOURS,
  weekEndSound,
} from './week-tick.ts';

const WEEK = 2700;

function soundsOverWeek(): { tick: number; sound: string }[] {
  const out: { tick: number; sound: string }[] = [];
  for (let t = 1; t <= WEEK; t++) {
    const sound = weekEndSound(t - 1, t, WEEK);
    if (sound) out.push({ tick: t, sound });
  }
  return out;
}

describe('week-end clock', () => {
  it('ticks once per hour through the last six hours, alternating tick and tock', () => {
    expect(WEEK_END_TICK_HOURS).toBe(6);
    expect(soundsOverWeek().map((s) => s.sound)).toEqual([
      'clock.tick',
      'clock.tock',
      'clock.tick',
      'clock.tock',
      'clock.tick',
      'clock.tock',
    ]);
  });

  it('starts at 6 pm on Sunday', () => {
    const first = soundsOverWeek()[0];
    expect(first).toBeDefined();
    expect(hourOfWeek(first!.tick, WEEK)).toBe(WEEK_HOURS - 6);
  });

  it('is silent at the week boundary and on a step that did not advance', () => {
    expect(weekEndSound(WEEK - 1, WEEK, WEEK)).toBeNull();
    expect(weekEndSound(2690, 2690, WEEK)).toBeNull();
  });

  it('ticks again in the following week', () => {
    const lateSecondWeek = WEEK + 2604;
    expect(weekEndSound(lateSecondWeek - 1, lateSecondWeek, WEEK)).toBe(
      'clock.tick',
    );
  });
});
