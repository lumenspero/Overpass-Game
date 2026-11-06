import { describe, expect, it } from 'vitest';
import {
  arriveBusinesses,
  createSim,
  destinationLot,
  placeBuilding,
  resetTuning,
  topUpSupply,
  tuning,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/** An empty 16×16 map, with the clock in the given week (weeks count from 1). */
function atWeek(week: number): SimState {
  const sim = createSim({ seed: 3, grid: makeGrid(16, 16), roadBudget: 0 });
  // Weeks count from 1, so week 1 is tick 0.
  sim.tick = (week - 1) * tuning.WEEK_TICKS;
  return sim;
}

function count(sim: SimState, kind: 'house' | 'destination', colour: number) {
  return sim.buildings.filter((b) => b.kind === kind && b.color === colour)
    .length;
}

describe('business arrival and house supply', () => {
  it('brings no business before the start week', () => {
    const sim = atWeek(tuning.BUSINESS_ARRIVAL_START_WEEK - 1);
    expect(arriveBusinesses(sim)).toBe(0);
    expect(sim.buildings).toHaveLength(0);
  });

  it('brings a business with its houses, topped up to the maximum ratio', () => {
    const sim = atWeek(tuning.BUSINESS_ARRIVAL_START_WEEK);
    expect(arriveBusinesses(sim)).toBe(tuning.BUSINESS_ARRIVALS_PER_WEEK);
    const business = sim.buildings.find((b) => b.kind === 'destination');
    if (!business) throw new Error('no business arrived');
    expect(count(sim, 'destination', business.color)).toBe(
      tuning.BUSINESS_ARRIVALS_PER_WEEK,
    );
    expect(count(sim, 'house', business.color)).toBe(
      tuning.SUPPLY_RATIO_MAX * tuning.BUSINESS_ARRIVALS_PER_WEEK,
    );
  });

  it('never adds houses above the maximum ratio', () => {
    const sim = atWeek(tuning.BUSINESS_ARRIVAL_START_WEEK);
    arriveBusinesses(sim);
    const business = sim.buildings.find((b) => b.kind === 'destination');
    if (!business) throw new Error('no business arrived');
    const houses = count(sim, 'house', business.color);
    expect(topUpSupply(sim)).toBe(0);
    expect(count(sim, 'house', business.color)).toBe(houses);
  });

  it('adds houses to a colour whose supply falls below the minimum', () => {
    const sim = atWeek(tuning.BUSINESS_ARRIVAL_START_WEEK);
    const tiles = [at(sim.grid, 8, 8)];
    placeBuilding(sim, {
      kind: 'destination',
      color: 1,
      tile: tiles[0] ?? 0,
      entrance: 's',
    });
    expect(count(sim, 'house', 1)).toBe(0);
    topUpSupply(sim, 1);
    expect(count(sim, 'house', 1)).toBe(tuning.SUPPLY_RATIO_MAX);
  });

  it('gives no houses to a colour without businesses', () => {
    const sim = atWeek(tuning.BUSINESS_ARRIVAL_START_WEEK);
    arriveBusinesses(sim);
    const colours = new Set(sim.buildings.map((b) => b.color));
    for (const b of sim.buildings) {
      if (b.kind === 'house') expect(colours.has(b.color)).toBe(true);
    }
    for (let c = 0; c < tuning.BUILDING_COLOR_COUNT; c++) {
      if (!colours.has(c)) expect(count(sim, 'house', c)).toBe(0);
    }
  });

  it('spawns new houses only within reach of a road or a building', () => {
    const sim = createSim({ seed: 3, grid: makeGrid(40, 40), roadBudget: 0 });
    sim.tick = (tuning.BUSINESS_ARRIVAL_START_WEEK - 1) * tuning.WEEK_TICKS;
    const business = at(sim.grid, 2, 2);
    placeBuilding(sim, {
      kind: 'destination',
      color: 1,
      tile: business,
      entrance: 's',
    });
    topUpSupply(sim, 1);
    const houses = sim.buildings.filter((b) => b.kind === 'house');
    expect(houses).toHaveLength(tuning.SUPPLY_RATIO_MAX);
    const home = sim.buildings.find((b) => b.kind === 'destination');
    const lot = home ? destinationLot(sim.grid, home) : null;
    if (!lot) throw new Error('no lot');
    const cols = sim.grid.cols;
    const dist = (a: number, b: number) =>
      Math.max(
        Math.abs((a % cols) - (b % cols)),
        Math.abs(Math.floor(a / cols) - Math.floor(b / cols)),
      );
    for (const h of houses) {
      // Within reach of the business's lot, or of a road that was already there: a house's own
      // stub road is made by the house, so it does not count for that house.
      const toLot = Math.min(...lot.tiles.map((t) => dist(h.tile, t)));
      const priorStubs = houses
        .filter((o) => o.id < h.id && o.stub !== undefined)
        .map((o) => o.stub as number);
      const toRoad = Math.min(
        Infinity,
        ...priorStubs.map((t) => dist(h.tile, t)),
      );
      expect(
        toLot <= tuning.HOUSE_BUILDING_REACH ||
          toRoad <= tuning.HOUSE_ROAD_REACH,
      ).toBe(true);
    }
  });

  it('runs the same way for the same seed', () => {
    const run = () => {
      const sim = atWeek(tuning.BUSINESS_ARRIVAL_START_WEEK);
      for (let i = 0; i < 3; i++) arriveBusinesses(sim);
      return sim.buildings.map((b) => `${b.kind}:${b.color}:${b.tile}`);
    };
    expect(run()).toEqual(run());
    resetTuning();
  });
});
