import { describe, expect, it } from 'vitest';
import {
  advanceClock,
  createClock,
  setPaused,
  setSpeed,
} from '../src/index.ts';

/** Feeds real time in frame-sized chunks, the way the game loop does. */
function feed(
  clock: ReturnType<typeof createClock>,
  totalMs: number,
  frameMs: number,
): number {
  let ticks = 0;
  for (let elapsed = 0; elapsed < totalMs; elapsed += frameMs)
    ticks += advanceClock(clock, frameMs);
  return ticks;
}

describe('fixed-step clock', () => {
  it('runs 30 ticks per second regardless of frame size', () => {
    expect(feed(createClock(), 1000, 10)).toBe(30);
    expect(feed(createClock(), 1000, 16.7)).toBe(30);
    expect(feed(createClock(), 1000, 50)).toBe(30);
  });

  it('runs no ticks while paused and resumes where it left off', () => {
    const clock = createClock();
    setPaused(clock, true);
    expect(feed(clock, 5000, 10)).toBe(0);
    setPaused(clock, false);
    expect(feed(clock, 1000, 10)).toBe(30);
  });

  it('multiplies tick rate by the chosen speed', () => {
    const clock = createClock();
    setSpeed(clock, 4);
    expect(feed(clock, 1000, 10)).toBe(120);
  });

  it('caps catch-up after a long stall', () => {
    expect(advanceClock(createClock(), 60_000)).toBeLessThanOrEqual(15);
  });
});
