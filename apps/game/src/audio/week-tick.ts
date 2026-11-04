import type { SoundEvent } from './catalog.ts';

/** Hours in a game week: seven days of 24 hours, as the calendar shows them. */
export const WEEK_HOURS = 7 * 24;

/** The clock ticks through this many hours at the end of Sunday, before the week ends. */
export const WEEK_END_TICK_HOURS = 6;

/** The hour of the week, 0 to 167, that a sim tick falls in. Monday 00:00 is hour 0. */
export function hourOfWeek(tick: number, weekTicks: number): number {
  return Math.floor(((tick % weekTicks) * WEEK_HOURS) / weekTicks);
}

/**
 * The week-end clock sound for a step from `before` to `after`, or null. It sounds once at the start
 * of each of the last hours of the week, alternating tick and tock. A step that did not advance
 * the clock, such as one after the game ended, makes no sound.
 */
export function weekEndSound(
  before: number,
  after: number,
  weekTicks: number,
): Extract<SoundEvent, 'clock.tick' | 'clock.tock'> | null {
  if (after === before) return null;
  const hour = hourOfWeek(after, weekTicks);
  if (hour < WEEK_HOURS - WEEK_END_TICK_HOURS) return null;
  if (hour === hourOfWeek(before, weekTicks)) return null;
  return hour % 2 === 0 ? 'clock.tick' : 'clock.tock';
}
