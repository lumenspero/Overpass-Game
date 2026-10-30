import { afterEach, describe, expect, it } from 'vitest';
import {
  addDemandPin,
  createSim,
  DEFAULT_TUNING,
  DEMAND_INTERVAL_TICKS,
  placeBuilding,
  resetTuning,
  step,
  tuning,
  WEEK_TICKS,
  weekOf,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

function destinationWorld() {
  const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 0 });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(sim.grid, 4, 2),
    entrance: 'w',
  });
  return sim;
}

describe('tuning', () => {
  afterEach(() => resetTuning());

  it('starts at the defaults, which the named constants also give', () => {
    expect(tuning).toEqual(DEFAULT_TUNING);
    expect(DEMAND_INTERVAL_TICKS).toBe(DEFAULT_TUNING.DEMAND_INTERVAL_TICKS);
    expect(WEEK_TICKS).toBe(DEFAULT_TUNING.WEEK_TICKS);
  });

  it('a changed interval applies from the pin after the one already scheduled', () => {
    const sim = destinationWorld();
    // Each pin schedules the next when it lands, so the second pin was set at the default.
    for (let i = 0; i < DEMAND_INTERVAL_TICKS; i++) step(sim);
    expect(sim.demand[0].pins).toBe(1);
    tuning.DEMAND_INTERVAL_TICKS = 10;
    for (let i = 0; i < DEMAND_INTERVAL_TICKS; i++) step(sim);
    expect(sim.demand[0].pins).toBe(2);
    for (let i = 0; i < 10; i++) step(sim);
    expect(sim.demand[0].pins).toBe(3);
  });

  it('a changed week length changes which week a tick is in', () => {
    tuning.WEEK_TICKS = 100;
    expect(weekOf(99)).toBe(1);
    expect(weekOf(100)).toBe(2);
  });

  it('resetTuning puts every value back to its default', () => {
    tuning.CAR_SPEED = 9;
    tuning.WEEK_TICKS = 5;
    resetTuning();
    expect(tuning).toEqual(DEFAULT_TUNING);
  });
});

describe('addDemandPin', () => {
  it('adds one pin at a destination', () => {
    const sim = destinationWorld();
    expect(addDemandPin(sim, 0)).toBe(true);
    expect(sim.demand[0].pins).toBe(1);
  });

  it('does nothing and reports false when there is no destination', () => {
    const sim = destinationWorld();
    expect(addDemandPin(sim, 99)).toBe(false);
  });
});
