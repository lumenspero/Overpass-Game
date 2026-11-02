import { tuning } from '@overpass-game/sim';

/**
 * The day and the clock shown in the top bar. Display only: the sim's week and its rules do not
 * change. A week is seven days of equal length, Monday first. The dial turns twice per day, so it
 * shows a 24-hour cycle on a 12-hour face, and the second half of the day is shown inverted (PM).
 */

export const DAY_NAMES = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
] as const;

const DAYS_PER_WEEK = DAY_NAMES.length;

/** Where the tick falls in the week, counted in days from 0 up to 7. */
function daysIntoWeek(tick: number): number {
  return ((tick % tuning.WEEK_TICKS) * DAYS_PER_WEEK) / tuning.WEEK_TICKS;
}

/** The day of the week, 0 for Monday up to 6 for Sunday. */
export function dayIndex(tick: number): number {
  return Math.floor(daysIntoWeek(tick));
}

export function dayName(tick: number): string {
  return DAY_NAMES[dayIndex(tick)];
}

/** How far through the current day the tick is, from 0 up to just under 1. */
export function dayProgress(tick: number): number {
  const days = daysIntoWeek(tick);
  return days - Math.floor(days);
}

/** The dial's rotation in degrees, 0 to 359. It turns 720 degrees per day: two 12-hour turns. */
export function clockAngle(tick: number): number {
  return (dayProgress(tick) * 720) % 360;
}

/** True in the second half of the day, when the dial is shown inverted. */
export function isPm(tick: number): boolean {
  return dayProgress(tick) >= 0.5;
}
