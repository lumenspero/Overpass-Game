import { describe, expect, it } from 'vitest';
import {
  createSim,
  OVERFLOW_FILL_PINS,
  OVERFLOW_PIN_LIMIT,
  placeBuilding,
  resetTuning,
  servePin,
  step,
  tuning,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/** A single round destination (id 0) with no road. Overflow does not depend on roads. */
function world(): SimState {
  const sim = createSim({ seed: 1, grid: makeGrid(7, 5), roadBudget: 0 });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(sim.grid, 2, 2),
    entrance: 'n',
  });
  return sim;
}

/** Ticks between requests at the test destination: round, with no growth yet. */
const INTERVAL = tuning.DEMAND_INTERVAL_TICKS;

describe('overflow', () => {
  it('adds pins up to the limit without overflowing', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT - 1;
    sim.demand[0].cooldown = 1;
    step(sim);
    expect(sim.demand[0].pins).toBe(OVERFLOW_PIN_LIMIT);
    expect(sim.demand[0].overflowFill).toBe(0);
  });

  it('starts the overflow pin when a request arrives while the limit is waiting, and adds no pin', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT;
    sim.demand[0].cooldown = 1;
    const events = step(sim);
    expect(sim.demand[0].pins).toBe(OVERFLOW_PIN_LIMIT);
    expect(sim.demand[0].overflowFill).toBeGreaterThan(0);
    expect(events).toContainEqual({ kind: 'overflow-started', destination: 0 });
  });

  it('fills steadily, in the time OVERFLOW_FILL_PINS more requests would take', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT;
    sim.demand[0].cooldown = 1;
    step(sim);
    const start = sim.demand[0].overflowFill ?? 0;
    for (let i = 0; i < 100; i++) step(sim);
    const per = 1 / (OVERFLOW_FILL_PINS * INTERVAL);
    expect((sim.demand[0].overflowFill ?? 0) - start).toBeCloseTo(100 * per, 6);
  });

  it('drains a ninth of the fill for each trip, before any pin is used up', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT;
    sim.demand[0].overflowFill = 0.5;
    servePin(sim, 0);
    expect(sim.demand[0].overflowFill).toBeCloseTo(
      0.5 - 1 / OVERFLOW_FILL_PINS,
      9,
    );
    expect(sim.demand[0].pins).toBe(OVERFLOW_PIN_LIMIT);
  });

  it('ends the overflow when the fill drains, then trips use up pins again', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT;
    sim.demand[0].overflowFill = 1 / OVERFLOW_FILL_PINS;
    sim.demand[0].cooldown = 1000;
    servePin(sim, 0);
    expect(sim.demand[0].overflowFill).toBe(0);
    // No new request has arrived, so the overflow does not start again by itself.
    step(sim);
    expect(sim.demand[0].overflowFill).toBe(0);
    servePin(sim, 0);
    expect(sim.demand[0].pins).toBe(OVERFLOW_PIN_LIMIT - 1);
  });

  it('ends the game when the overflow pin is full, and stops the clock', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT;
    sim.demand[0].cooldown = 1;
    tuning.SUPPLY_RATIO_MIN = 0; // no houses, so no car can arrive and drain the fill
    while (sim.over === null) step(sim);
    resetTuning();
    expect(sim.over.destination).toBe(0);
    // It started on tick 1 and fills in OVERFLOW_FILL_PINS request intervals.
    expect(
      Math.abs(sim.over.tick - (1 + OVERFLOW_FILL_PINS * INTERVAL)),
    ).toBeLessThanOrEqual(2);
    const tick = sim.tick;
    step(sim);
    expect(sim.tick).toBe(tick);
  });

  it('reads a run saved before the overflow pin existed as not overflowing', () => {
    const sim = world();
    delete sim.demand[0].overflowFill;
    sim.demand[0].pins = 3;
    step(sim);
    servePin(sim, 0);
    expect(sim.demand[0].pins).toBe(2);
    expect(sim.over).toBeNull();
  });
});
