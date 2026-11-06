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

  it('lets a neighbouring house share a stub, so both join the road at one node', () => {
    const { sim, house } = withHouse();
    const shared = at(sim.grid, 2, 3);
    // A second house at (3,3), facing east onto its own stub at (4,3), then dragged onto the first house's stub.
    const r = placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 3, 3),
      entrance: 'e',
    });
    if (!r.ok) throw new Error('setup failed');
    const own = at(sim.grid, 4, 3);
    expect(moveHouseStub(sim, r.id, shared)).toEqual({ ok: true, moved: true });
    expect(sim.buildings[house]?.stub).toBe(shared);
    expect(sim.buildings[r.id]?.stub).toBe(shared);
    expect(sim.roads[own]).toBe(0);
    expect(sim.budget).toBe(10);
  });

  it('keeps a shared stub for the house still on it, and stays free whichever house moves first', () => {
    for (const first of ['original', 'sharer'] as const) {
      const { sim, house } = withHouse();
      const shared = at(sim.grid, 2, 3);
      const r = placeBuilding(sim, {
        kind: 'house',
        color: 0,
        tile: at(sim.grid, 3, 3),
        entrance: 'e',
      });
      if (!r.ok) throw new Error('setup failed');
      moveHouseStub(sim, r.id, shared);
      const [a, b] = first === 'original' ? [house, r.id] : [r.id, house];
      // The first house moves away: the road stays, for the house still on it.
      const awayA = a === house ? at(sim.grid, 1, 3) : at(sim.grid, 4, 3);
      expect(moveHouseStub(sim, a, awayA).ok).toBe(true);
      expect(sim.roads[shared]).toBe(1);
      expect(sim.buildings[b]?.stub).toBe(shared);
      // Then the other moves away too: the free road goes, and the budget never changed.
      const awayB = b === house ? at(sim.grid, 1, 3) : at(sim.grid, 4, 3);
      expect(moveHouseStub(sim, b, awayB).ok).toBe(true);
      expect(sim.roads[shared]).toBe(0);
      expect(sim.budget).toBe(10);
    }
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
