import { afterEach, describe, expect, it } from 'vitest';
import {
  createSim,
  openDistricts,
  placeBuilding,
  placeRoads,
  resetTuning,
  step,
  tuning,
  WEEK_TICKS,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/**
 * A 5x1 strip: district 0 is columns 0-1, district 1 is column 2, district 2 is columns 3-4.
 * A house sits on column 0 facing east, a destination on column 4 facing west.
 */
function strip(): SimState {
  const grid = makeGrid(5, 1);
  const districts = [0, 0, 1, 2, 2];
  const sim = createSim({ seed: 1, grid, roadBudget: 100, districts });
  placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(grid, 0, 0),
    entrance: 'e',
  });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(grid, 4, 0),
    entrance: 'w',
  });
  return sim;
}

function atWeek(sim: SimState, week: number): void {
  sim.tick = (week - 1) * tuning.WEEK_TICKS;
}

describe('districts', () => {
  afterEach(() => resetTuning());

  it('reads the opening weeks from tuning, so the debug panel can move them', () => {
    tuning.EXPANSION_WEEK_1 = 2;
    tuning.EXPANSION_WEEK_2 = 4;
    // Week 1 starts at tick 0, so week 2 starts at WEEK_TICKS, and so on.
    expect(openDistricts(0)).toBe(1);
    expect(openDistricts(1 * WEEK_TICKS)).toBe(2);
    expect(openDistricts(2 * WEEK_TICKS)).toBe(2);
    expect(openDistricts(3 * WEEK_TICKS)).toBe(3);
  });

  it('opens one more district at each scheduled week', () => {
    // Week 3 starts at tick 2 * WEEK_TICKS, and week 6 at 5 * WEEK_TICKS.
    expect(openDistricts(0)).toBe(1);
    expect(openDistricts(2 * WEEK_TICKS - 1)).toBe(1);
    expect(openDistricts(2 * WEEK_TICKS)).toBe(2);
    expect(openDistricts(5 * WEEK_TICKS - 1)).toBe(2);
    expect(openDistricts(5 * WEEK_TICKS)).toBe(3);
  });

  it('never opens a district beyond the schedule', () => {
    expect(openDistricts(100 * WEEK_TICKS)).toBe(3);
  });

  it('refuses roads on a locked tile, and allows them once it opens', () => {
    const sim = strip();
    atWeek(sim, 1);
    expect(placeRoads(sim, [at(sim.grid, 2, 0)])).toEqual({
      ok: false,
      reason: 'locked',
    });
    atWeek(sim, 3);
    expect(placeRoads(sim, [at(sim.grid, 2, 0)])).toEqual({
      ok: true,
      added: 1,
    });
  });

  it('keeps a locked house from sending cars', () => {
    const sim = strip();
    atWeek(sim, 1);
    placeRoads(sim, [at(sim.grid, 1, 0)]); // the house is connected, but its own district is open
    sim.demand[1].pins = 5;
    for (let i = 0; i < 200; i++) step(sim);
    // The destination is in district 2, still locked, so no car may be sent.
    expect(sim.cars).toHaveLength(0);
  });

  it('keeps a locked destination from collecting pins', () => {
    const sim = strip();
    atWeek(sim, 1);
    for (let i = 0; i < tuning.DEMAND_INTERVAL_TICKS * 3; i++) step(sim);
    expect(sim.demand[1].pins).toBe(0);
  });

  it('a district that is open at the start is open to the sim by default', () => {
    const grid = makeGrid(3, 1);
    const sim = createSim({ seed: 1, grid, roadBudget: 10 });
    expect(placeRoads(sim, [0, 1, 2])).toEqual({ ok: true, added: 3 });
  });
});
