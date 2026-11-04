import { describe, expect, it } from 'vitest';
import { allowPlay, MIN_GAP_S } from './throttle.ts';

describe('allowPlay', () => {
  it('always plays a sound with no gap, or one not yet played', () => {
    expect(allowPlay(1, 1, undefined)).toBe(true);
    expect(allowPlay(undefined, 0, 0.1)).toBe(true);
  });

  it('drops a play inside the gap and allows one after it', () => {
    expect(allowPlay(1, 1.05, 0.1)).toBe(false);
    expect(allowPlay(1, 1.1, 0.1)).toBe(true);
  });

  it('throttles the frequent sounds', () => {
    expect(MIN_GAP_S['car.arrived']).toBeGreaterThan(0);
    expect(MIN_GAP_S['pin.appeared']).toBeGreaterThan(0);
    expect(MIN_GAP_S['menu.enter']).toBeUndefined();
  });
});
