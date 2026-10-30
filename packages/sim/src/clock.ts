import { SPEED_OPTIONS, tuning } from './config.ts';

export type Speed = (typeof SPEED_OPTIONS)[number];

/**
 * Converts real elapsed time into whole simulation ticks.
 * The fractional remainder is carried between calls, so the tick count depends
 * only on total elapsed time, not on how that time was split into frames.
 */
export interface Clock {
  residue: number;
  paused: boolean;
  speed: Speed;
}

const EPSILON = 1e-9;

export function createClock(): Clock {
  return { residue: 0, paused: false, speed: 1 };
}

export function setPaused(clock: Clock, paused: boolean): void {
  clock.paused = paused;
}

export function setSpeed(clock: Clock, speed: Speed): void {
  clock.speed = speed;
}

/** Returns how many fixed ticks to run for `elapsedMs` of real time. */
export function advanceClock(clock: Clock, elapsedMs: number): number {
  if (clock.paused || elapsedMs <= 0) return 0;
  clock.residue += (elapsedMs / 1000) * tuning.TICKS_PER_SECOND * clock.speed;
  const whole = Math.floor(clock.residue + EPSILON);
  clock.residue -= whole;
  return Math.min(whole, tuning.MAX_CATCHUP_TICKS);
}
