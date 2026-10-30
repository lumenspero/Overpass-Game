import { afterEach, describe, expect, it } from 'vitest';
import {
  chooseUpgrade,
  createSim,
  findRoute,
  placeCrossing,
  placeRoads,
  removeRoads,
  resetTuning,
  Terrain,
  type SimState,
  type TerrainKind,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

afterEach(() => resetTuning());

/** Land at x=1 and x=5 on row 1, with `kind` filling x=2..`last` between them. */
function gap(kind: TerrainKind, last: number, cols = 8): SimState {
  const blocked: Array<[number, number, TerrainKind]> = [];
  for (let x = 2; x <= last; x++) blocked.push([x, 1, kind]);
  const sim = createSim({
    seed: 1,
    grid: makeGrid(cols, 3, blocked),
    roadBudget: 20,
  });
  sim.stock.bridge = 1;
  sim.stock.tunnel = 1;
  return sim;
}

describe('bridges', () => {
  it('lays a road across a water gap, costing budget and one bridge', () => {
    const sim = gap(Terrain.Water, 4);
    const result = placeCrossing(
      sim,
      'bridge',
      at(sim.grid, 1, 1),
      at(sim.grid, 5, 1),
    );
    expect(result).toEqual({ ok: true, added: 5 });
    for (let x = 1; x <= 5; x++) expect(sim.roads[at(sim.grid, x, 1)]).toBe(1);
    expect(sim.budget).toBe(15);
    expect(sim.stock.bridge).toBe(0);
  });

  it('joins the two banks, so a car can route across', () => {
    const sim = gap(Terrain.Water, 4);
    placeCrossing(sim, 'bridge', at(sim.grid, 1, 1), at(sim.grid, 5, 1));
    expect(
      findRoute(
        sim.grid,
        sim.roads,
        sim.links,
        at(sim.grid, 1, 1),
        at(sim.grid, 5, 1),
      ),
    ).not.toBeNull();
  });

  it('refuses without a bridge in stock', () => {
    const sim = gap(Terrain.Water, 4);
    sim.stock.bridge = 0;
    const result = placeCrossing(
      sim,
      'bridge',
      at(sim.grid, 1, 1),
      at(sim.grid, 5, 1),
    );
    expect(result).toEqual({ ok: false, reason: 'no-stock' });
    expect(sim.roads.some((r) => r === 1)).toBe(false);
  });

  it('refuses a span longer than BRIDGE_MAX_SPAN', () => {
    const sim = gap(Terrain.Water, 5, 9);
    const result = placeCrossing(
      sim,
      'bridge',
      at(sim.grid, 1, 1),
      at(sim.grid, 6, 1),
    );
    expect(result).toEqual({ ok: false, reason: 'too-long' });
  });

  it('refuses a gap that is not all water', () => {
    const sim = gap(Terrain.Water, 4);
    sim.grid.terrain[at(sim.grid, 3, 1)] = Terrain.Land;
    const result = placeCrossing(
      sim,
      'bridge',
      at(sim.grid, 1, 1),
      at(sim.grid, 5, 1),
    );
    expect(result).toEqual({ ok: false, reason: 'bad-terrain' });
  });

  it('refuses ends that are not aligned', () => {
    const sim = gap(Terrain.Water, 4);
    const result = placeCrossing(
      sim,
      'bridge',
      at(sim.grid, 1, 1),
      at(sim.grid, 5, 2),
    );
    expect(result).toEqual({ ok: false, reason: 'not-aligned' });
  });

  it('refuses ends on water', () => {
    const sim = gap(Terrain.Water, 4);
    const result = placeCrossing(
      sim,
      'bridge',
      at(sim.grid, 2, 1),
      at(sim.grid, 5, 1),
    );
    expect(result).toEqual({ ok: false, reason: 'bad-endpoint' });
  });

  it('refuses a crossing with no span', () => {
    const sim = gap(Terrain.Water, 4);
    const result = placeCrossing(
      sim,
      'bridge',
      at(sim.grid, 1, 1),
      at(sim.grid, 1, 1),
    );
    expect(result).toEqual({ ok: false, reason: 'no-span' });
  });

  it('refuses when the budget cannot pay for the road', () => {
    const sim = gap(Terrain.Water, 4);
    sim.budget = 4;
    const result = placeCrossing(
      sim,
      'bridge',
      at(sim.grid, 1, 1),
      at(sim.grid, 5, 1),
    );
    expect(result).toEqual({ ok: false, reason: 'no-budget' });
    expect(sim.stock.bridge).toBe(1);
  });

  it('lets a drag run over an existing bridge tile at no cost', () => {
    const sim = gap(Terrain.Water, 4);
    placeCrossing(sim, 'bridge', at(sim.grid, 1, 1), at(sim.grid, 5, 1));
    expect(placeRoads(sim, [at(sim.grid, 3, 1)])).toEqual({
      ok: true,
      added: 0,
    });
  });

  it('removing a bridge tile refunds its budget', () => {
    const sim = gap(Terrain.Water, 4);
    placeCrossing(sim, 'bridge', at(sim.grid, 1, 1), at(sim.grid, 5, 1));
    expect(removeRoads(sim, [at(sim.grid, 3, 1)])).toBe(1);
    expect(sim.budget).toBe(16);
  });
});

describe('tunnels', () => {
  it('runs through a mountain range up to TUNNEL_MAX_SPAN', () => {
    const sim = gap(Terrain.Mountain, 5, 8);
    const result = placeCrossing(
      sim,
      'tunnel',
      at(sim.grid, 1, 1),
      at(sim.grid, 6, 1),
    );
    expect(result).toEqual({ ok: true, added: 6 });
    expect(sim.stock.tunnel).toBe(0);
    expect(sim.stock.bridge).toBe(1);
  });

  it('refuses a mountain span longer than TUNNEL_MAX_SPAN', () => {
    const sim = gap(Terrain.Mountain, 6, 9);
    const result = placeCrossing(
      sim,
      'tunnel',
      at(sim.grid, 1, 1),
      at(sim.grid, 7, 1),
    );
    expect(result).toEqual({ ok: false, reason: 'too-long' });
  });

  it('is not paid for by a bridge', () => {
    const sim = gap(Terrain.Mountain, 5, 8);
    sim.stock.tunnel = 0;
    const result = placeCrossing(
      sim,
      'tunnel',
      at(sim.grid, 1, 1),
      at(sim.grid, 6, 1),
    );
    expect(result).toEqual({ ok: false, reason: 'no-stock' });
  });

  it('a tunnel cannot cross water', () => {
    const sim = gap(Terrain.Water, 4);
    const result = placeCrossing(
      sim,
      'tunnel',
      at(sim.grid, 1, 1),
      at(sim.grid, 5, 1),
    );
    expect(result).toEqual({ ok: false, reason: 'bad-terrain' });
  });
});

describe('choosing an upgrade', () => {
  it('moves the oldest offer into stock once answered', () => {
    const sim = gap(Terrain.Water, 4);
    sim.offers = [
      ['bridge', 'tunnel'],
      ['tunnel', 'bridge'],
    ];
    expect(chooseUpgrade(sim, 'tunnel')).toEqual({ ok: true });
    expect(sim.stock.tunnel).toBe(2);
    expect(sim.offers).toEqual([['tunnel', 'bridge']]);
  });

  it('refuses a kind that was not offered, and leaves the offer open', () => {
    const sim = gap(Terrain.Water, 4);
    sim.offers = [['bridge', 'tunnel']];
    expect(chooseUpgrade(sim, 'light')).toEqual({
      ok: false,
      reason: 'not-offered',
    });
    expect(sim.offers).toHaveLength(1);
  });

  it('refuses when there is no offer', () => {
    const sim = gap(Terrain.Water, 4);
    expect(chooseUpgrade(sim, 'bridge')).toEqual({
      ok: false,
      reason: 'no-offer',
    });
  });
});
