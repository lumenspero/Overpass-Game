import { describe, expect, it } from 'vitest';
import {
  createSim,
  OVERFLOW_PIN_LIMIT,
  OVERFLOW_TICKS,
  placeBuilding,
  servePin,
  step,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/** A single destination (id 0) with no road. Overflow does not depend on roads. */
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

describe('overflow', () => {
  it('does not count down while pins are at the limit', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT;
    for (let i = 0; i < 10; i++) step(sim);
    expect(sim.demand[0].overflow).toBe(0);
    expect(sim.over).toBeNull();
  });

  it('starts a countdown when pins go over the limit, and runs it down each tick', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT + 1;
    step(sim);
    expect(sim.demand[0].overflow).toBe(OVERFLOW_TICKS);
    step(sim);
    expect(sim.demand[0].overflow).toBe(OVERFLOW_TICKS - 1);
  });

  it('resets the countdown when a pin is served', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT + 2;
    for (let i = 0; i < 50; i++) step(sim);
    expect(sim.demand[0].overflow).toBeLessThan(OVERFLOW_TICKS);
    servePin(sim, 0);
    expect(sim.demand[0].overflow).toBe(OVERFLOW_TICKS);
  });

  it('clears the countdown when pins drop back to the limit', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT + 1;
    for (let i = 0; i < 5; i++) step(sim);
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT;
    step(sim);
    expect(sim.demand[0].overflow).toBe(0);
  });

  it('ends the game when a countdown runs out, and stops the clock', () => {
    const sim = world();
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT + 1;
    while (sim.over === null) step(sim);
    // The first overflowing tick starts the countdown; it runs out OVERFLOW_TICKS ticks later.
    expect(sim.over).toEqual({ tick: OVERFLOW_TICKS + 1, destination: 0 });
    const tick = sim.tick;
    step(sim);
    expect(sim.tick).toBe(tick);
  });
});
