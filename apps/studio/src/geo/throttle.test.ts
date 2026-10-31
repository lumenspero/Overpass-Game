import { describe, expect, it } from 'vitest';
import { createThrottle } from './throttle.ts';

/** A clock that only moves when wait() is called, so timing is exact. */
function fakeClock() {
  let now = 0;
  return {
    clock: () => now,
    wait: (ms: number) => {
      now += ms;
      return Promise.resolve();
    },
  };
}

describe('createThrottle', () => {
  it('starts calls at least the interval apart, in order', async () => {
    const { clock, wait } = fakeClock();
    const throttled = createThrottle(1000, clock, wait);
    const starts: number[] = [];

    await Promise.all(
      [1, 2, 3].map((n) => throttled(async () => (starts.push(clock()), n))),
    );

    expect(starts).toEqual([0, 1000, 2000]);
  });

  it('does not delay a call once the interval has passed', async () => {
    let now = 0;
    const waits: number[] = [];
    const throttled = createThrottle(
      1000,
      () => now,
      (ms) => {
        waits.push(ms);
        now += ms;
        return Promise.resolve();
      },
    );
    await throttled(async () => undefined);
    now = 5000; // a long gap since the first call started
    await throttled(async () => undefined);
    expect(waits).toEqual([]);
  });

  it('keeps going after a task fails', async () => {
    const { clock, wait } = fakeClock();
    const throttled = createThrottle(1000, clock, wait);
    await expect(
      throttled(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(throttled(async () => 'ok')).resolves.toBe('ok');
  });
});
