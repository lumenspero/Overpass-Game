import { describe, expect, it } from 'vitest';
import {
  arrivalsInWeek,
  arriveBusinesses,
  chooseOffer,
  createSim,
  destinationLot,
  houseMoments,
  placeBuilding,
  placeStartingPair,
  resetTuning,
  step,
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

  it('brings a square business, whose houses come later at a house moment', () => {
    const sim = atWeek(tuning.BUSINESS_ARRIVAL_START_WEEK);
    expect(arriveBusinesses(sim)).toBe(tuning.BUSINESS_ARRIVALS_PER_WEEK);
    const business = sim.buildings.find((b) => b.kind === 'destination');
    if (!business) throw new Error('no business arrived');
    expect(business.shape).toBe('square');
    expect(count(sim, 'house', business.color)).toBe(0);
  });

  it('never adds houses above the maximum ratio', () => {
    const sim = atWeek(tuning.BUSINESS_ARRIVAL_START_WEEK);
    arriveBusinesses(sim);
    const business = sim.buildings.find((b) => b.kind === 'destination');
    if (!business) throw new Error('no business arrived');
    topUpSupply(sim);
    const houses = count(sim, 'house', business.color);
    expect(houses).toBe(tuning.SUPPLY_RATIO_MAX);
    expect(topUpSupply(sim)).toBe(0);
    expect(count(sim, 'house', business.color)).toBe(houses);
  });

  it('brings one business a week, and one more every tenth week', () => {
    expect(arrivalsInWeek(2)).toBe(1);
    expect(arrivalsInWeek(9)).toBe(1);
    expect(arrivalsInWeek(10)).toBe(2);
    expect(arrivalsInWeek(11)).toBe(1);
    expect(arrivalsInWeek(20)).toBe(2);
  });

  it('brings only square businesses before the switch week', () => {
    const sim = createSim({ seed: 5, grid: makeGrid(40, 40), roadBudget: 0 });
    for (
      let w = tuning.BUSINESS_ARRIVAL_START_WEEK;
      w < tuning.SHAPE_SWITCH_WEEK;
      w++
    ) {
      sim.tick = (w - 1) * tuning.WEEK_TICKS + 1;
      arriveBusinesses(sim);
    }
    const businesses = sim.buildings.filter((b) => b.kind === 'destination');
    expect(businesses.length).toBeGreaterThan(0);
    for (const b of businesses) expect(b.shape).toBe('square');
  });

  it('from the switch week, can level up a square business to round instead of adding one', () => {
    const sim = atWeek(tuning.SHAPE_SWITCH_WEEK + 1);
    placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 8, 8),
      entrance: 's',
      shape: 'square',
    });
    tuning.ARRIVAL_LEVEL_UP_CHANCE = 1;
    tuning.ARRIVAL_ROUND_CHANCE = 0;
    expect(arriveBusinesses(sim)).toBe(1);
    resetTuning();
    expect(sim.buildings).toHaveLength(1);
    expect(sim.buildings[0]?.shape).toBe('round');
  });

  it('from the switch week, can bring a new round business', () => {
    const sim = atWeek(tuning.SHAPE_SWITCH_WEEK + 1);
    tuning.ARRIVAL_LEVEL_UP_CHANCE = 0;
    tuning.ARRIVAL_ROUND_CHANCE = 1;
    expect(arriveBusinesses(sim)).toBe(1);
    resetTuning();
    expect(sim.buildings[0]?.shape).toBe('round');
  });

  it('plans one or two house moments a week, the first in its first quarter', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (let week = 1; week <= 12; week++) {
        const moments = houseMoments(seed, week);
        expect(moments.length).toBeGreaterThanOrEqual(tuning.HOUSE_MOMENTS_MIN);
        expect(moments.length).toBeLessThanOrEqual(tuning.HOUSE_MOMENTS_MAX);
        expect(moments[0]).toBeGreaterThanOrEqual(1);
        expect(moments[0]).toBeLessThanOrEqual(tuning.WEEK_TICKS / 4);
        for (const m of moments) expect(m).toBeLessThan(tuning.WEEK_TICKS);
        expect(new Set(moments).size).toBe(moments.length);
        expect(houseMoments(seed, week)).toEqual(moments);
      }
    }
  });

  it('in play, starts square, supplies houses in week 1, and brings a business after the week 2 reward', () => {
    const sim = createSim({
      seed: 4,
      grid: makeGrid(30, 30),
      roadBudget: 0,
      startFence: { col: 3, row: 3, cols: 24, rows: 24 },
    });
    tuning.OVERFLOW_TICKS = 1e9;
    expect(placeStartingPair(sim)).toBe(true);
    const start = sim.buildings.find((b) => b.kind === 'destination');
    expect(start?.shape).toBe('square');
    while (sim.tick < tuning.WEEK_TICKS - 1) step(sim);
    // The starting colour was below the minimum, so a house moment topped it up during week 1.
    expect(count(sim, 'house', 0)).toBe(tuning.SUPPLY_RATIO_MAX);
    const before = sim.buildings.filter((b) => b.kind === 'destination').length;
    step(sim); // the week ends and the reward is offered
    expect(sim.offers.length).toBeGreaterThan(0);
    expect(sim.buildings.filter((b) => b.kind === 'destination')).toHaveLength(
      before,
    );
    const [first] = sim.offers;
    if (first) chooseOffer(sim, first[0]);
    step(sim); // the first tick of week 2
    resetTuning();
    expect(sim.buildings.filter((b) => b.kind === 'destination')).toHaveLength(
      before + 1,
    );
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

  it('brings nothing, and tops up no houses, under the noSpawns rule', () => {
    const sim = createSim({
      seed: 3,
      grid: makeGrid(16, 16),
      roadBudget: 0,
      rules: [{ kind: 'noSpawns' }],
    });
    placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 8, 8),
      entrance: 's',
    });
    tuning.OVERFLOW_TICKS = 1e9;
    for (let i = 0; i < tuning.WEEK_TICKS * 3; i++) {
      const [first] = sim.offers;
      if (first) chooseOffer(sim, first[0]);
      step(sim);
    }
    resetTuning();
    expect(sim.buildings).toHaveLength(1);
  });

  it('never places a house on a lot tile', () => {
    // A house is refused on a lot's open strip, which has no building on it but is reserved.
    const sim = createSim({ seed: 2, grid: makeGrid(16, 16), roadBudget: 0 });
    placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 8, 8),
      entrance: 's',
    });
    const business = sim.buildings[0];
    const lot = business ? destinationLot(sim.grid, business) : null;
    if (!lot) throw new Error('no lot');
    const strip = lot.tiles.filter((t) => sim.buildingAt[t] === -1);
    expect(strip.length).toBeGreaterThan(0);
    for (const t of strip) {
      const result = placeBuilding(sim, {
        kind: 'house',
        color: 0,
        tile: t,
        entrance: 'n',
      });
      expect(result).toEqual({ ok: false, reason: 'occupied' });
    }
    // Nor does supply put one there, whatever the seed.
    for (let seed = 1; seed <= 20; seed++) {
      const run = createSim({ seed, grid: makeGrid(16, 16), roadBudget: 0 });
      placeBuilding(run, {
        kind: 'destination',
        color: 0,
        tile: at(run.grid, 8, 8),
        entrance: 's',
      });
      topUpSupply(run, 0);
      const first = run.buildings[0];
      const tiles = first ? (destinationLot(run.grid, first)?.tiles ?? []) : [];
      for (const h of run.buildings.filter((b) => b.kind === 'house')) {
        expect(tiles).not.toContain(h.tile);
      }
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
