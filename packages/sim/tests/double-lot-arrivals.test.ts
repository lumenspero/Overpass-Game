import { afterEach, describe, expect, it } from 'vitest';
import {
  addSecondBuildings,
  arriveBusinesses,
  createSim,
  destinationLot,
  isOpenTile,
  lotRoads,
  placeBuilding,
  resetTuning,
  Terrain,
  tuning,
  type Building,
  type Grid,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

afterEach(() => resetTuning());

function setChance(chance: number): void {
  tuning.DOUBLE_LOT_CHANCE_EARLY = chance;
  tuning.DOUBLE_LOT_CHANCE_LATE = chance;
}

/** Runs the weekly arrivals for weeks `from` to `to` on a map, with a fence that does not grow. */
function arrivals(grid: Grid, from: number, to: number, seed = 5): SimState {
  const sim = createSim({
    seed,
    grid,
    roadBudget: 0,
    startFence: { col: 0, row: 0, cols: grid.cols, rows: grid.rows },
  });
  for (let week = from; week <= to; week++) {
    sim.tick = (week - 1) * tuning.WEEK_TICKS;
    arriveBusinesses(sim);
  }
  return sim;
}

function businesses(sim: SimState): Building[] {
  return sim.buildings.filter((b) => b.kind === 'destination');
}

describe('double lots in play', () => {
  it('gives every arrival a double lot at a 100% chance, where one fits', () => {
    setChance(1);
    const sim = arrivals(makeGrid(60, 60), 2, 5);
    expect(businesses(sim)).toHaveLength(4);
    for (const b of businesses(sim)) expect(b.lot).toBe('double');
  });

  it('gives no arrival a double lot at a 0% chance', () => {
    setChance(0);
    const sim = arrivals(makeGrid(60, 60), 2, 5);
    expect(businesses(sim)).toHaveLength(4);
    for (const b of businesses(sim)) expect(b.lot).toBeUndefined();
  });

  it('keeps a double lot and both of its inlet roads inside the fence', () => {
    setChance(1);
    for (let seed = 1; seed <= 20; seed++) {
      const grid = makeGrid(30, 30);
      const sim = createSim({
        seed,
        grid,
        roadBudget: 0,
        startFence: { col: 8, row: 8, cols: 12, rows: 12 },
      });
      // Tick 0 of the arrival week, so the fence has not grown past its start plus one week's steps.
      sim.tick = (tuning.BUSINESS_ARRIVAL_START_WEEK - 1) * tuning.WEEK_TICKS;
      arriveBusinesses(sim);
      const [b] = businesses(sim);
      if (!b) throw new Error(`no business arrived for seed ${seed}`);
      expect(b.lot).toBe('double');
      const lot = destinationLot(sim.grid, b);
      if (!lot) throw new Error('no lot');
      expect(lot.farRoad).toBeDefined();
      expect(lotRoads(lot)).toHaveLength(2);
      for (const t of [...lot.tiles, ...lotRoads(lot)]) {
        expect(isOpenTile(sim, t)).toBe(true);
      }
    }
  });

  it('falls back to a single lot when no double lot fits in the fence', () => {
    setChance(1);
    // A double lot needs 8 tiles of depth with its two roads; a 7×7 map has room for a single only.
    const sim = arrivals(makeGrid(7, 7), 2, 2);
    const [b] = businesses(sim);
    if (!b) throw new Error('no business arrived');
    expect(b.lot).toBeUndefined();
  });

  it('brings no business when not even a single lot fits', () => {
    setChance(1);
    const sim = arrivals(makeGrid(4, 4), 2, 2);
    expect(businesses(sim)).toHaveLength(0);
  });

  it('refuses a double lot whose far road is off the map', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(9, 9), roadBudget: 0 });
    // Facing north from row 3, the lot covers rows 3 to 8, so its far road would be row 9.
    const result = placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 2, 3),
      entrance: 'n',
      lot: 'double',
    });
    expect(result).toEqual({ ok: false, reason: 'out-of-bounds' });
  });

  it('refuses a double lot whose far road is water, and takes a single lot there', () => {
    // The far road of a double lot at (2, 2) facing north is (2, 8).
    const grid = makeGrid(12, 12, [[2, 8, Terrain.Water]]);
    const sim = createSim({ seed: 1, grid, roadBudget: 0 });
    const spot = { kind: 'destination', color: 0, entrance: 'n' } as const;
    const tile = at(grid, 2, 2);
    expect(placeBuilding(sim, { ...spot, tile, lot: 'double' })).toEqual({
      ok: false,
      reason: 'unbuildable',
    });
    expect(placeBuilding(sim, { ...spot, tile }).ok).toBe(true);
  });

  it('adds the second building the set number of weeks after the business arrived', () => {
    setChance(1);
    const grid = makeGrid(40, 40);
    const sim = createSim({
      seed: 5,
      grid,
      roadBudget: 0,
      startFence: { col: 0, row: 0, cols: 40, rows: 40 },
    });
    // A business arrives on the first tick of its week; second buildings are added as a week ends.
    const arrival = 3 * tuning.WEEK_TICKS + 1;
    sim.tick = arrival;
    arriveBusinesses(sim);
    const far = () => sim.buildings.filter((b) => b.wing === 'far').length;
    const weekEnd = (weeks: number) => (3 + weeks) * tuning.WEEK_TICKS;
    sim.tick = weekEnd(tuning.SECOND_BUILDING_DELAY_WEEKS - 1);
    addSecondBuildings(sim);
    expect(far()).toBe(0);
    sim.tick = weekEnd(tuning.SECOND_BUILDING_DELAY_WEEKS);
    addSecondBuildings(sim);
    expect(far()).toBe(1);
  });

  it('rolls once for each arrival, so the same seed gives the same lots', () => {
    setChance(0.5);
    const kinds = (sim: SimState) => businesses(sim).map((b) => b.lot);
    const a = kinds(arrivals(makeGrid(60, 60), 2, 9, 11));
    const b = kinds(arrivals(makeGrid(60, 60), 2, 9, 11));
    expect(a).toEqual(b);
    expect(a).toContain('double');
    expect(a).toContain(undefined);
  });
});
