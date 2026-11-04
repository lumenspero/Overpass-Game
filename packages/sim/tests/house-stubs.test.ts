import { describe, expect, it } from 'vitest';
import {
  createSim,
  ensureHouseStubs,
  isHouseStub,
  linkTiles,
  moveHouseStub,
  placeBuilding,
  placeRoads,
  removeRoads,
  type SimState,
  Terrain,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/** A house at (2,2) facing south, with water to its east at (3,2). */
function withHouse(): { sim: SimState; house: number } {
  const sim = createSim({
    seed: 1,
    grid: makeGrid(6, 6, [[3, 2, Terrain.Water]]),
    roadBudget: 10,
  });
  const r = placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(sim.grid, 2, 2),
    entrance: 's',
  });
  if (!r.ok) throw new Error('setup failed');
  return { sim, house: r.id };
}

describe('house stubs', () => {
  it('a new house comes with a free stub on the tile it faces', () => {
    const { sim, house } = withHouse();
    const stub = at(sim.grid, 2, 3);
    expect(sim.buildings[house]?.stub).toBe(stub);
    expect(sim.roads[stub]).toBe(1);
    expect(isHouseStub(sim, stub)).toBe(true);
    expect(sim.budget).toBe(10);
  });

  it('erasing never removes a stub, and refunds nothing for it', () => {
    const { sim } = withHouse();
    const stub = at(sim.grid, 2, 3);
    expect(removeRoads(sim, [stub])).toBe(0);
    expect(sim.roads[stub]).toBe(1);
    expect(sim.budget).toBe(10);
  });

  it('moves to a diagonal neighbour for free, taking the old free stub with it', () => {
    const { sim, house } = withHouse();
    const old = at(sim.grid, 2, 3);
    const diagonal = at(sim.grid, 3, 1);
    expect(moveHouseStub(sim, house, diagonal)).toEqual({
      ok: true,
      moved: true,
    });
    expect(sim.buildings[house]?.stub).toBe(diagonal);
    expect(sim.roads[diagonal]).toBe(1);
    expect(sim.roads[old]).toBe(0);
    expect(sim.budget).toBe(10);
  });

  it('changes nothing when moved to the tile it is already on', () => {
    const { sim, house } = withHouse();
    expect(moveHouseStub(sim, house, at(sim.grid, 2, 3))).toEqual({
      ok: true,
      moved: false,
    });
  });

  it('takes over a road already there, and leaves it when it moves away while still joined', () => {
    const { sim, house } = withHouse();
    const road = at(sim.grid, 1, 2);
    const beyond = at(sim.grid, 0, 2);
    placeRoads(sim, [road, beyond]);
    linkTiles(sim, road, beyond);
    expect(sim.budget).toBe(8);
    moveHouseStub(sim, house, road);
    expect(sim.buildings[house]?.stubAdopted).toBe(true);
    moveHouseStub(sim, house, at(sim.grid, 2, 1));
    expect(sim.roads[road]).toBe(1);
    expect(sim.budget).toBe(8);
  });

  it('removes and refunds a taken-over road left with nothing joined to it', () => {
    const { sim, house } = withHouse();
    const road = at(sim.grid, 1, 2);
    placeRoads(sim, [road]);
    expect(sim.budget).toBe(9);
    moveHouseStub(sim, house, road);
    moveHouseStub(sim, house, at(sim.grid, 2, 1));
    expect(sim.roads[road]).toBe(0);
    expect(sim.budget).toBe(10);
  });

  it('refuses a tile that is not a neighbour, is water, or holds a building', () => {
    const { sim, house } = withHouse();
    expect(moveHouseStub(sim, house, at(sim.grid, 4, 4))).toEqual({
      ok: false,
      reason: 'not-adjacent',
    });
    expect(moveHouseStub(sim, house, at(sim.grid, 3, 2))).toEqual({
      ok: false,
      reason: 'unbuildable',
    });
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 1, 1),
      entrance: 'n',
    });
    expect(moveHouseStub(sim, house, at(sim.grid, 1, 1))).toEqual({
      ok: false,
      reason: 'occupied',
    });
    // The other house's stub is taken too.
    expect(moveHouseStub(sim, house, at(sim.grid, 1, 0))).toEqual({
      ok: false,
      reason: 'not-adjacent',
    });
  });

  it('gives a stub to a house saved before houses had one', () => {
    const { sim, house } = withHouse();
    const b = sim.buildings[house];
    if (!b || b.stub === undefined) throw new Error('setup failed');
    sim.roads[b.stub] = 0;
    delete b.stub;
    delete b.stubAdopted;
    ensureHouseStubs(sim);
    expect(b.stub).toBe(at(sim.grid, 2, 3));
    expect(sim.roads[at(sim.grid, 2, 3)]).toBe(1);
  });
});
