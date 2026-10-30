import { describe, expect, it } from 'vitest';
import { createSim, findRoute, placeRoads } from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

function roadsOn(tiles: Array<[number, number]>) {
  const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 100 });
  placeRoads(
    sim,
    tiles.map(([x, y]) => at(sim.grid, x, y)),
  );
  return sim;
}

describe('findRoute', () => {
  it('finds the straight route along a row of roads', () => {
    const sim = roadsOn([
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    expect(
      findRoute(sim.grid, sim.roads, at(sim.grid, 1, 2), at(sim.grid, 3, 2)),
    ).toEqual([at(sim.grid, 1, 2), at(sim.grid, 2, 2), at(sim.grid, 3, 2)]);
  });

  it('prefers the shorter of two routes', () => {
    const sim = roadsOn([
      [1, 2],
      [2, 2],
      [3, 2], // straight, 3 tiles
      [1, 1],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
      [3, 2], // detour, 7 tiles
    ]);
    const route = findRoute(
      sim.grid,
      sim.roads,
      at(sim.grid, 1, 2),
      at(sim.grid, 3, 2),
    );
    expect(route).toHaveLength(3);
  });

  it('returns null when the roads are disconnected', () => {
    const sim = roadsOn([
      [1, 2],
      [3, 2],
    ]);
    expect(
      findRoute(sim.grid, sim.roads, at(sim.grid, 1, 2), at(sim.grid, 3, 2)),
    ).toBeNull();
  });

  it('returns a single tile when start and goal are the same', () => {
    const sim = roadsOn([[2, 2]]);
    expect(
      findRoute(sim.grid, sim.roads, at(sim.grid, 2, 2), at(sim.grid, 2, 2)),
    ).toEqual([at(sim.grid, 2, 2)]);
  });

  it('returns null when either end is not a road', () => {
    const sim = roadsOn([
      [1, 2],
      [2, 2],
    ]);
    expect(
      findRoute(sim.grid, sim.roads, at(sim.grid, 1, 2), at(sim.grid, 4, 4)),
    ).toBeNull();
    expect(
      findRoute(sim.grid, sim.roads, at(sim.grid, 0, 0), at(sim.grid, 2, 2)),
    ).toBeNull();
  });

  it('gives the same route every time for the same roads', () => {
    const sim = roadsOn([
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
      [3, 2],
      [3, 1],
      [3, 0],
      [2, 0],
      [1, 0],
    ]);
    const a = findRoute(
      sim.grid,
      sim.roads,
      at(sim.grid, 1, 1),
      at(sim.grid, 3, 2),
    );
    const b = findRoute(
      sim.grid,
      sim.roads,
      at(sim.grid, 1, 1),
      at(sim.grid, 3, 2),
    );
    expect(a).toEqual(b);
  });

  it('only steps between edge-sharing road tiles', () => {
    const sim = roadsOn([
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
    ]);
    const route =
      findRoute(sim.grid, sim.roads, at(sim.grid, 1, 1), at(sim.grid, 3, 2)) ??
      [];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      const d =
        Math.abs((a % 5) - (b % 5)) +
        Math.abs(Math.floor(a / 5) - Math.floor(b / 5));
      expect(d).toBe(1);
    }
  });
});
