import { describe, expect, it } from 'vitest';
import {
  BUILDING_COLOR_COUNT,
  createSim,
  entranceTile,
  isConnected,
  placeBuilding,
  placeRoads,
  Terrain,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

function newSim(blocked: Parameters<typeof makeGrid>[2] = []) {
  return createSim({ seed: 1, grid: makeGrid(5, 5, blocked), roadBudget: 20 });
}

describe('entrance tile', () => {
  it('finds the neighbour on each side', () => {
    const grid = makeGrid(3, 3);
    const mid = at(grid, 1, 1);
    expect(entranceTile(grid, mid, 'n')).toBe(at(grid, 1, 0));
    expect(entranceTile(grid, mid, 'e')).toBe(at(grid, 2, 1));
    expect(entranceTile(grid, mid, 's')).toBe(at(grid, 1, 2));
    expect(entranceTile(grid, mid, 'w')).toBe(at(grid, 0, 1));
  });

  it('is null when the entrance faces off the grid', () => {
    const grid = makeGrid(3, 3);
    expect(entranceTile(grid, at(grid, 0, 0), 'n')).toBeNull();
    expect(entranceTile(grid, at(grid, 0, 0), 'w')).toBeNull();
    expect(entranceTile(grid, at(grid, 2, 2), 'e')).toBeNull();
  });
});

describe('placing buildings', () => {
  it('places a house on land and records it on its tile', () => {
    const sim = newSim();
    const r = placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 2, 2),
      entrance: 's',
    });
    expect(r).toEqual({ ok: true, id: 0 });
    expect(sim.buildings).toEqual([
      {
        id: 0,
        kind: 'house',
        color: 0,
        tile: at(sim.grid, 2, 2),
        entrance: 's',
        // Its stub, a free road on the tile it faces.
        stub: at(sim.grid, 2, 3),
        stubAdopted: false,
      },
    ]);
    expect(sim.buildingAt[at(sim.grid, 2, 2)]).toBe(0);
  });

  it('places destinations on parks too', () => {
    const sim = createSim({
      seed: 1,
      grid: makeGrid(6, 5, [[1, 1, Terrain.Park]]),
      roadBudget: 20,
    });
    const r = placeBuilding(sim, {
      kind: 'destination',
      color: 1,
      tile: at(sim.grid, 1, 1),
      entrance: 'n',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects water and mountains', () => {
    const sim = newSim([
      [0, 0, Terrain.Water],
      [1, 0, Terrain.Mountain],
    ]);
    expect(
      placeBuilding(sim, {
        kind: 'house',
        color: 0,
        tile: at(sim.grid, 0, 0),
        entrance: 's',
      }),
    ).toEqual({
      ok: false,
      reason: 'unbuildable',
    });
    expect(
      placeBuilding(sim, {
        kind: 'house',
        color: 0,
        tile: at(sim.grid, 1, 0),
        entrance: 's',
      }).ok,
    ).toBe(false);
  });

  it('rejects a tile that is already a road or a building', () => {
    const sim = newSim();
    placeRoads(sim, [at(sim.grid, 2, 2)]);
    expect(
      placeBuilding(sim, {
        kind: 'house',
        color: 0,
        tile: at(sim.grid, 2, 2),
        entrance: 'n',
      }),
    ).toEqual({
      ok: false,
      reason: 'occupied',
    });
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 0, 0),
      entrance: 'n',
    });
    expect(
      placeBuilding(sim, {
        kind: 'destination',
        color: 0,
        tile: at(sim.grid, 0, 0),
        entrance: 'e',
      }),
    ).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });

  it('rejects tiles outside the grid and colours out of range', () => {
    const sim = newSim();
    expect(
      placeBuilding(sim, { kind: 'house', color: 0, tile: 99, entrance: 's' }),
    ).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    expect(
      placeBuilding(sim, {
        kind: 'house',
        color: BUILDING_COLOR_COUNT,
        tile: 0,
        entrance: 's',
      }),
    ).toEqual({ ok: false, reason: 'bad-color' });
    expect(
      placeBuilding(sim, { kind: 'house', color: -1, tile: 0, entrance: 's' })
        .ok,
    ).toBe(false);
  });
});

describe('roads and buildings share tiles', () => {
  it('roads cannot be placed on a building tile', () => {
    const sim = newSim();
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 2, 2),
      entrance: 's',
    });
    expect(placeRoads(sim, [at(sim.grid, 2, 2)])).toEqual({
      ok: false,
      reason: 'unbuildable',
    });
    expect(sim.roads[at(sim.grid, 2, 2)]).toBe(0);
  });

  it('a house connects through its stub, which starts free on the tile its entrance faces', () => {
    const sim = newSim();
    const budget = sim.budget;
    const house = placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 2, 2),
      entrance: 'e',
    });
    if (!house.ok) throw new Error('setup failed');
    const b = sim.buildings[house.id];
    if (!b) throw new Error('setup failed');

    expect(b.stub).toBe(at(sim.grid, 3, 2));
    expect(sim.roads[at(sim.grid, 3, 2)]).toBe(1);
    expect(sim.budget).toBe(budget);
    expect(isConnected(sim, b)).toBe(true);
  });

  it('a building at the grid edge with its entrance off the grid is never connected', () => {
    const sim = newSim();
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 0, 0),
      entrance: 'n',
    });
    expect(isConnected(sim, sim.buildings[0])).toBe(false);
  });
});
