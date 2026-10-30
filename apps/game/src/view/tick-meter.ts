/**
 * Measures the sim's tick rate over fixed windows. Pure, so it is tested with fake
 * times. The rate comes from sim ticks, not frames, so it shows the real simulation speed.
 */
export interface TickMeter {
  windowMs: number;
  startMs: number;
  startTick: number;
  /** Ticks per second over the last completed window. */
  rate: number;
}

export function createTickMeter(
  nowMs: number,
  tick: number,
  windowMs = 1000,
): TickMeter {
  return { windowMs, startMs: nowMs, startTick: tick, rate: 0 };
}

/** Call every frame. Updates the rate once a full window has passed, and returns it. */
export function sampleTickRate(
  meter: TickMeter,
  nowMs: number,
  tick: number,
): number {
  const elapsed = nowMs - meter.startMs;
  if (elapsed >= meter.windowMs) {
    meter.rate = ((tick - meter.startTick) * 1000) / elapsed;
    meter.startMs = nowMs;
    meter.startTick = tick;
  }
  return meter.rate;
}
