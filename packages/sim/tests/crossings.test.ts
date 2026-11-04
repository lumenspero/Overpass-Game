import { afterEach, describe, expect, it } from 'vitest';
import {
  chooseOffer,
  createSim,
  findRoute,
  placeCrossing,
  removeRoads,
  resetTuning,
  Terrain,
  type SimState,
  type TerrainKind,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

afterEach(() => resetTuning());

/** Land on row 1 with `kind` filling the given x positions. Eight columns, budget 20. */
function world(kind: TerrainKind, xs: number[], cols = 8, rows = 3): SimState {
  const blocked: Array<[number, number, TerrainKind]> = xs.map((x) => [
    x,
    1,
    kind,
  ]);
  const sim = createSim({
    seed: 1,
    grid: makeGrid(cols, rows, blocked),
    roadBudget: 20,
  });
  sim.stock.bridge = 1;
  sim.stock.tunnel = 1;
  return sim;
}

/** Tile indices for a list of [x, y] points, in drag order. */
function path(sim: SimState, points: Array<[number, number]>): number[] {
  return points.map(([x, y]) => at(sim.grid, x, y));
}

const ROW = (xs: number[]): Array<[number, number]> => xs.map((x) => [x, 1]);

describe('bridges along a drag', () => {
  it('lays a road across a water gap, costing budget and one bridge', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    const result = placeCrossing(
      sim,
      'bridge',
      path(sim, ROW([1, 2, 3, 4, 5])),
    );
    expect(result).toEqual({ ok: true, added: 5, crossings: 1 });
    for (let x = 1; x <= 5; x++) expect(sim.roads[at(sim.grid, x, 1)]).toBe(1);
    expect(sim.budget).toBe(15);
    expect(sim.stock.bridge).toBe(0);
  });

  it('joins the two banks, so a car can route across', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    placeCrossing(sim, 'bridge', path(sim, ROW([1, 2, 3, 4, 5])));
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

  it('crosses the corner of a lake diagonally, when the water run is at most three tiles', () => {
    const sim = createSim({
      seed: 1,
      grid: makeGrid(8, 8, [
        [3, 3, Terrain.Water],
        [4, 4, Terrain.Water],
        [5, 5, Terrain.Water],
      ]),
      roadBudget: 20,
    });
    sim.stock.bridge = 1;
    const tiles = path(sim, [
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ]);
    expect(placeCrossing(sim, 'bridge', tiles)).toEqual({
      ok: true,
      added: 5,
      crossings: 1,
    });
  });

  it('refuses a diagonal water run of four tiles', () => {
    const sim = createSim({
      seed: 1,
      grid: makeGrid(9, 9, [
        [3, 3, Terrain.Water],
        [4, 4, Terrain.Water],
        [5, 5, Terrain.Water],
        [6, 6, Terrain.Water],
      ]),
      roadBudget: 20,
    });
    sim.stock.bridge = 1;
    const tiles = path(sim, [
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
      [7, 7],
    ]);
    expect(placeCrossing(sim, 'bridge', tiles)).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  it('refuses without a bridge in stock', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    sim.stock.bridge = 0;
    expect(
      placeCrossing(sim, 'bridge', path(sim, ROW([1, 2, 3, 4, 5]))),
    ).toEqual({
      ok: false,
      reason: 'no-stock',
    });
    expect(sim.roads.some((r) => r === 1)).toBe(false);
  });

  it('needs one bridge per separate water run', () => {
    const sim = world(Terrain.Water, [2, 5]);
    sim.stock.bridge = 1;
    const tiles = path(sim, ROW([1, 2, 3, 4, 5, 6]));
    expect(placeCrossing(sim, 'bridge', tiles)).toEqual({
      ok: false,
      reason: 'no-stock',
    });
    sim.stock.bridge = 2;
    expect(placeCrossing(sim, 'bridge', tiles)).toEqual({
      ok: true,
      added: 6,
      crossings: 2,
    });
    expect(sim.stock.bridge).toBe(0);
  });

  it('refuses a path with a gap in it', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    expect(placeCrossing(sim, 'bridge', path(sim, ROW([1, 3, 5])))).toEqual({
      ok: false,
      reason: 'not-a-path',
    });
  });

  it('refuses a path that starts or ends on water', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    expect(placeCrossing(sim, 'bridge', path(sim, ROW([2, 3, 4, 5])))).toEqual({
      ok: false,
      reason: 'bad-endpoint',
    });
  });

  it('refuses a single tile', () => {
    const sim = world(Terrain.Water, [2]);
    expect(placeCrossing(sim, 'bridge', path(sim, ROW([1])))).toEqual({
      ok: false,
      reason: 'no-span',
    });
  });

  it('refuses when the budget cannot pay for the road', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    sim.budget = 4;
    expect(
      placeCrossing(sim, 'bridge', path(sim, ROW([1, 2, 3, 4, 5]))),
    ).toEqual({
      ok: false,
      reason: 'no-budget',
    });
    expect(sim.stock.bridge).toBe(1);
  });

  it('lets a drag run over an existing bridge tile at no cost', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    placeCrossing(sim, 'bridge', path(sim, ROW([1, 2, 3, 4, 5])));
    sim.stock.bridge = 0;
    expect(
      placeCrossing(sim, 'bridge', path(sim, ROW([1, 2, 3, 4, 5]))),
    ).toEqual({
      ok: true,
      added: 0,
      crossings: 0,
    });
  });

  it('removing a bridge tile refunds its budget', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    placeCrossing(sim, 'bridge', path(sim, ROW([1, 2, 3, 4, 5])));
    expect(removeRoads(sim, [at(sim.grid, 3, 1)])).toBe(1);
    expect(sim.budget).toBe(16);
  });
});

describe('tunnels along a drag', () => {
  it('runs through a mountain range up to TUNNEL_MAX_SPAN', () => {
    const sim = world(Terrain.Mountain, [2, 3, 4, 5], 8);
    expect(
      placeCrossing(sim, 'tunnel', path(sim, ROW([1, 2, 3, 4, 5, 6]))),
    ).toEqual({
      ok: true,
      added: 6,
      crossings: 1,
    });
    expect(sim.stock.tunnel).toBe(0);
    expect(sim.stock.bridge).toBe(1);
  });

  it('refuses a mountain run longer than TUNNEL_MAX_SPAN', () => {
    const sim = world(Terrain.Mountain, [2, 3, 4, 5, 6], 9);
    expect(
      placeCrossing(sim, 'tunnel', path(sim, ROW([1, 2, 3, 4, 5, 6, 7]))),
    ).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  it('is not paid for by a bridge', () => {
    const sim = world(Terrain.Mountain, [2, 3, 4, 5]);
    sim.stock.tunnel = 0;
    expect(
      placeCrossing(sim, 'tunnel', path(sim, ROW([1, 2, 3, 4, 5, 6]))),
    ).toEqual({
      ok: false,
      reason: 'no-stock',
    });
  });

  it('a tunnel cannot cross water, and a bridge cannot cross mountain', () => {
    const water = world(Terrain.Water, [2, 3, 4]);
    expect(
      placeCrossing(water, 'tunnel', path(water, ROW([1, 2, 3, 4, 5]))),
    ).toEqual({
      ok: false,
      reason: 'blocked',
    });
    const mountain = world(Terrain.Mountain, [2, 3, 4]);
    expect(
      placeCrossing(mountain, 'bridge', path(mountain, ROW([1, 2, 3, 4, 5]))),
    ).toEqual({
      ok: false,
      reason: 'blocked',
    });
  });
});

describe('choosing an offer', () => {
  it('moves the oldest offer into stock once answered', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    sim.offers = [
      ['bridge', 'tunnel'],
      ['tunnel', 'lights'],
    ];
    expect(chooseOffer(sim, 'tunnel')).toEqual({ ok: true });
    expect(sim.stock.tunnel).toBe(2);
    expect(sim.offers).toEqual([['tunnel', 'lights']]);
  });

  it('refuses an option that was not offered, and leaves the offer open', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    sim.offers = [['bridge', 'tunnel']];
    expect(chooseOffer(sim, 'lights')).toEqual({
      ok: false,
      reason: 'not-offered',
    });
    expect(sim.offers).toHaveLength(1);
  });

  it('refuses when there is no offer', () => {
    const sim = world(Terrain.Water, [2, 3, 4]);
    expect(chooseOffer(sim, 'bridge')).toEqual({
      ok: false,
      reason: 'no-offer',
    });
  });
});
