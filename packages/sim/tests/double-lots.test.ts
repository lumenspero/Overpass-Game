import { afterEach, describe, expect, it } from 'vitest';
import {
  accessTiles,
  addSecondBuildings,
  createSim,
  DOUBLE_PARKING_SPACES,
  lotAt,
  lotPath,
  PARKING_SPACES,
  placeBuilding,
  resetTuning,
  spacesFor,
  tuning,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/** A 9×9 map with a destination at (2, 2) facing north. Its road is at row 1. */
function world(lot?: 'roll' | 'double' | 'single'): SimState {
  const sim = createSim({ seed: 1, grid: makeGrid(9, 9), roadBudget: 100 });
  const result = placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(sim.grid, 2, 2),
    entrance: 'n',
    lot,
  });
  if (!result.ok) throw new Error(`setup failed: ${result.reason}`);
  return sim;
}

afterEach(() => resetTuning());

describe('double lots', () => {
  it('are 5 long and 6 deep, with two 3×3 halves and a 2×6 strip', () => {
    const grid = makeGrid(9, 9);
    const origin = at(grid, 2, 2);
    const near = lotAt(grid, origin, 'n', 'double', 'near');
    const far = lotAt(grid, origin, 'n', 'double', 'far');
    if (!near || !far) throw new Error('no lot');
    expect(near.tiles).toHaveLength(30);
    expect(near.footprint).toHaveLength(9);
    expect(far.footprint).toHaveLength(9);
    expect(near.strip).toHaveLength(12);
    // The halves do not overlap, and together they are the lot's buildings.
    expect(near.footprint.filter((t) => far.footprint.includes(t))).toEqual([]);
  });

  it('take six parking spaces, and a single lot keeps three', () => {
    expect(DOUBLE_PARKING_SPACES).toHaveLength(7);
    expect(PARKING_SPACES).toHaveLength(3);
    expect(spacesFor('double')).toBe(DOUBLE_PARKING_SPACES);
    expect(spacesFor('single')).toBe(PARKING_SPACES);
  });

  it('start with only the near building, then gain the far one the set delay after placing', () => {
    const sim = world('double');
    expect(sim.buildings).toHaveLength(1);
    const near = sim.buildings[0];
    expect(near.lot).toBe('double');

    sim.tick = tuning.WEEK_TICKS * tuning.SECOND_BUILDING_DELAY_WEEKS - 1;
    addSecondBuildings(sim);
    expect(sim.buildings).toHaveLength(1);

    sim.tick = tuning.WEEK_TICKS * tuning.SECOND_BUILDING_DELAY_WEEKS;
    addSecondBuildings(sim);
    expect(sim.buildings).toHaveLength(2);
    const far = sim.buildings[1];
    expect(far.wing).toBe('far');
    expect(far.lotOwner).toBe(near.id);
    expect(sim.demand[far.id]).toBeDefined();
    const farTiles = lotAt(sim.grid, near.tile, near.entrance, 'double', 'far');
    for (const t of farTiles?.footprint ?? []) {
      expect(sim.buildingAt[t]).toBe(far.id);
    }
  });

  it('is rolled at the chance for the week, so a 100% chance always gives a double lot', () => {
    tuning.DOUBLE_LOT_CHANCE_EARLY = 1;
    tuning.DOUBLE_LOT_CHANCE_LATE = 1;
    expect(world('roll').buildings[0].lot).toBe('double');
  });

  it('a 0% chance always gives a single lot', () => {
    tuning.DOUBLE_LOT_CHANCE_EARLY = 0;
    tuning.DOUBLE_LOT_CHANCE_LATE = 0;
    expect(world('roll').buildings[0].lot).toBeUndefined();
  });
});

describe('far inlet', () => {
  it('gives a double lot a far road beyond its far edge, and a single lot none', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(12, 12), roadBudget: 100 });
    const origin = 3 * sim.grid.cols + 3;
    const double = lotAt(sim.grid, origin, 'n', 'double', 'near');
    const single = lotAt(sim.grid, origin, 'n', 'single', 'near');
    if (!double || !single) throw new Error('no lot');
    expect(double.farRoad).toBe(origin + 6 * sim.grid.cols);
    expect(single.farRoad).toBeUndefined();
  });

  it('reaches a double destination through either road', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(12, 12), roadBudget: 100 });
    const origin = 3 * sim.grid.cols + 3;
    const building = {
      id: 0,
      kind: 'destination' as const,
      color: 0,
      tile: origin,
      entrance: 'n' as const,
      lot: 'double' as const,
    };
    const roads = accessTiles(sim.grid, building);
    expect(roads).toHaveLength(2);
  });

  it('drives in through the far inlet with a path that ends on the space slope', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(12, 12), roadBudget: 100 });
    const origin = 3 * sim.grid.cols + 3;
    const building = {
      id: 0,
      kind: 'destination' as const,
      color: 0,
      tile: origin,
      entrance: 'n' as const,
      lot: 'double' as const,
    };
    for (let k = 0; k < DOUBLE_PARKING_SPACES.length; k++) {
      const path = lotPath(sim.grid, building, k, 'in', 'far');
      if (!path) throw new Error('no far path');
      const a = path[path.length - 2]!;
      const b = path[path.length - 1]!;
      expect((b.y - a.y) / (b.x - a.x)).toBeCloseTo(0.25, 6);
    }
  });
});

describe('destination shapes', () => {
  it('square destinations pin more slowly than round ones', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(12, 12), roadBudget: 100 });
    const square = placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 0, 3),
      entrance: 'n',
      shape: 'square',
    });
    const round = placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 6, 3),
      entrance: 'n',
      shape: 'round',
    });
    if (!square.ok || !round.ok) throw new Error('placement refused');
    expect(sim.demand[square.id]?.cooldown).toBe(
      tuning.DEMAND_INTERVAL_SQUARE_TICKS,
    );
    expect(sim.demand[round.id]?.cooldown).toBe(tuning.DEMAND_INTERVAL_TICKS);
    expect(tuning.DEMAND_INTERVAL_SQUARE_TICKS).toBeGreaterThan(
      tuning.DEMAND_INTERVAL_TICKS,
    );
  });
});
