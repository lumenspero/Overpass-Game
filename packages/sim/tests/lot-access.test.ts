import { describe, expect, it } from 'vitest';
import {
  createSim,
  destinationLot,
  lotBlocker,
  placeBuilding,
  placeRoads,
  Terrain,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/** Where a destination at (10,5) facing south puts its access road tile, on open land. */
function accessTile(): number {
  const sim = createSim({ seed: 1, grid: makeGrid(20, 20), roadBudget: 50 });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(sim.grid, 10, 5),
    entrance: 's',
  });
  return destinationLot(sim.grid, sim.buildings[0]!)!.road;
}

describe('a lot’s access road tile', () => {
  it('refuses a business whose access tile is water, so its inlet never faces the river', () => {
    const road = accessTile();
    const grid = makeGrid(20, 20);
    grid.terrain[road] = Terrain.Water;
    const sim = createSim({ seed: 1, grid, roadBudget: 50 });
    expect(lotBlocker(sim, at(grid, 10, 5), 's')).toBe('unbuildable');
  });

  it('refuses one whose access tile is a mountain', () => {
    const road = accessTile();
    const grid = makeGrid(20, 20);
    grid.terrain[road] = Terrain.Mountain;
    const sim = createSim({ seed: 1, grid, roadBudget: 50 });
    expect(lotBlocker(sim, at(grid, 10, 5), 's')).toBe('unbuildable');
  });

  it('allows one whose access tile is open land, or already holds a road', () => {
    const road = accessTile();
    const sim = createSim({ seed: 1, grid: makeGrid(20, 20), roadBudget: 50 });
    expect(lotBlocker(sim, at(sim.grid, 10, 5), 's')).toBeNull();
    expect(placeRoads(sim, [road]).ok).toBe(true);
    expect(lotBlocker(sim, at(sim.grid, 10, 5), 's')).toBeNull();
  });
});
