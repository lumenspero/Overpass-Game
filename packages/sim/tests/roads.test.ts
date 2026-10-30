import { describe, expect, it } from 'vitest';
import { createSim, placeRoads, removeRoads, Terrain } from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

describe('road placement and budget', () => {
  it('places roads on land and spends one budget per new tile', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 10 });
    const result = placeRoads(sim, [
      at(sim.grid, 0, 0),
      at(sim.grid, 1, 0),
      at(sim.grid, 2, 0),
    ]);
    expect(result).toEqual({ ok: true, added: 3 });
    expect(sim.budget).toBe(7);
  });

  it('does not charge for tiles that already have a road', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 10 });
    placeRoads(sim, [at(sim.grid, 0, 0)]);
    const again = placeRoads(sim, [at(sim.grid, 0, 0), at(sim.grid, 1, 0)]);
    expect(again).toEqual({ ok: true, added: 1 });
    expect(sim.budget).toBe(8);
  });

  it('rejects water and mountains without changing anything', () => {
    const grid = makeGrid(5, 5, [
      [1, 0, Terrain.Water],
      [2, 0, Terrain.Mountain],
    ]);
    const sim = createSim({ seed: 1, grid, roadBudget: 10 });
    expect(placeRoads(sim, [at(grid, 0, 0), at(grid, 1, 0)])).toEqual({
      ok: false,
      reason: 'unbuildable',
    });
    expect(placeRoads(sim, [at(grid, 2, 0)])).toEqual({
      ok: false,
      reason: 'unbuildable',
    });
    expect(sim.roads.every((r) => r === 0)).toBe(true);
    expect(sim.budget).toBe(10);
  });

  it('rejects tiles outside the grid', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3) });
    expect(placeRoads(sim, [-1])).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    expect(placeRoads(sim, [9])).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
  });

  it('is all or nothing when the budget runs out', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 2 });
    const result = placeRoads(sim, [0, 1, 2]);
    expect(result).toEqual({ ok: false, reason: 'no-budget' });
    expect(sim.roads.every((r) => r === 0)).toBe(true);
    expect(sim.budget).toBe(2);
  });

  it('refunds one budget per removed tile and ignores empty tiles', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 10 });
    placeRoads(sim, [0, 1, 2]);
    expect(removeRoads(sim, [1, 3])).toBe(1);
    expect(sim.budget).toBe(8);
    expect(sim.roads[1]).toBe(0);
  });
});
