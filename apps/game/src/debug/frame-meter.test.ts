import { describe, expect, it } from 'vitest';
import { FrameMeter } from './frame-meter.ts';

describe('FrameMeter', () => {
  it('reports zeros before any frame', () => {
    expect(new FrameMeter().summary().samples).toBe(0);
  });

  it('averages and keeps the worst frame over the window', () => {
    const meter = new FrameMeter(3);
    meter.record(10, 1);
    meter.record(20, 2);
    meter.record(30, 3);
    const s = meter.summary();
    expect(s.frameAvg).toBe(20);
    expect(s.frameWorst).toBe(30);
    expect(s.simAvg).toBe(2);
    expect(s.samples).toBe(3);
  });

  it('drops the oldest frames once the window is full', () => {
    const meter = new FrameMeter(2);
    meter.record(100, 0);
    meter.record(10, 0);
    meter.record(20, 0);
    expect(meter.summary().frameWorst).toBe(20);
    expect(meter.summary().samples).toBe(2);
  });
});
