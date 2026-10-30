import { TICKS_PER_SECOND } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { createTickMeter, sampleTickRate } from './tick-meter.ts';

describe('tick meter', () => {
  it('reads zero until a full window has passed', () => {
    const m = createTickMeter(0, 0);
    expect(sampleTickRate(m, 500, 15)).toBe(0);
  });

  it('reports the sim tick rate over one window', () => {
    const m = createTickMeter(0, 0);
    expect(sampleTickRate(m, 1000, TICKS_PER_SECOND)).toBe(TICKS_PER_SECOND);
  });

  it('reads zero while paused', () => {
    const m = createTickMeter(0, 0);
    sampleTickRate(m, 1000, TICKS_PER_SECOND);
    expect(sampleTickRate(m, 2000, TICKS_PER_SECOND)).toBe(0);
  });

  it('scales with the speed multiplier', () => {
    const m = createTickMeter(0, 0);
    expect(sampleTickRate(m, 1000, TICKS_PER_SECOND * 4)).toBe(
      TICKS_PER_SECOND * 4,
    );
  });

  it('keeps its last value between window boundaries', () => {
    const m = createTickMeter(0, 0);
    sampleTickRate(m, 1000, 30);
    expect(sampleTickRate(m, 1500, 45)).toBe(30);
  });
});
