import { describe, expect, it } from 'vitest';
import {
  type Car,
  createSim,
  Terrain,
  LIGHT_MAX_GREEN_TICKS,
  LIGHT_MIN_GREEN_TICKS,
  linkTiles,
  placeBuilding,
  placeControl,
  placeRoads,
  removeRoads,
  ROUNDABOUT_CAPACITY,
  type SimState,
  tileOpen,
  updateLights,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/** A plus-shaped junction at (3, 3), with roads on all four arms. */
function junction(): { sim: SimState; centre: number; arms: number[] } {
  const grid = makeGrid(7, 7);
  const sim = createSim({ seed: 1, grid, roadBudget: 80 });
  const centre = at(grid, 3, 3);
  const arms = [at(grid, 2, 3), at(grid, 4, 3), at(grid, 3, 2), at(grid, 3, 4)];
  placeRoads(sim, [centre, ...arms]);
  for (const arm of arms) linkTiles(sim, centre, arm);
  sim.stock.roundabout = 2;
  sim.stock.light = 2;
  return { sim, centre, arms };
}

/** A car standing on `tile`, `along` into it. */
function carOn(id: number, tile: number, along: number): Car {
  return {
    id,
    house: 0,
    destination: 0,
    state: 'driving',
    route: [tile],
    progress: 0,
    along,
    timer: 0,
  };
}

// Step codes from movement.ts: (dx + 1) * 3 + (dy + 1).
const EAST = 7;
const SOUTH = 5;

describe('placing a roundabout or light', () => {
  it('refuses a mountain tile and a tile under a building', () => {
    const grid = makeGrid(7, 7);
    const sim = createSim({ seed: 1, grid, roadBudget: 80 });
    sim.stock.light = 2;
    const mountain = at(grid, 1, 1);
    grid.terrain[mountain] = Terrain.Mountain;
    expect(placeControl(sim, mountain, 'light')).toEqual({
      ok: false,
      reason: 'bad-endpoint',
    });
    const built = at(grid, 4, 4);
    sim.buildingAt[built] = 0;
    expect(placeControl(sim, built, 'light')).toEqual({
      ok: false,
      reason: 'bad-endpoint',
    });
    expect(sim.stock.light).toBe(2);
  });

  it('places on a plain road tile, not only on a junction', () => {
    const grid = makeGrid(7, 7);
    const sim = createSim({ seed: 1, grid, roadBudget: 80 });
    const straight = at(grid, 2, 2);
    placeRoads(sim, [straight, at(grid, 3, 2)]);
    linkTiles(sim, straight, at(grid, 3, 2));
    sim.stock.light = 1;
    expect(placeControl(sim, straight, 'light')).toEqual({ ok: true });
    expect(sim.controls[straight]).toBe('light');
  });

  it('takes one from stock, and only one control per tile', () => {
    const { sim, centre } = junction();
    expect(placeControl(sim, centre, 'roundabout')).toEqual({ ok: true });
    expect(sim.stock.roundabout).toBe(1);
    expect(placeControl(sim, centre, 'light')).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });

  it('refuses without stock', () => {
    const { sim, centre } = junction();
    sim.stock.light = 0;
    expect(placeControl(sim, centre, 'light')).toEqual({
      ok: false,
      reason: 'no-stock',
    });
  });

  it('returns its stock when its road is erased', () => {
    const { sim, centre } = junction();
    placeControl(sim, centre, 'light');
    expect(sim.stock.light).toBe(1);
    removeRoads(sim, [centre]);
    expect(sim.controls[centre]).toBeUndefined();
    expect(sim.stock.light).toBe(2);
  });
});

describe('a roundabout', () => {
  it('admits cars with a gap at the entrance, up to its capacity', () => {
    const { sim, centre } = junction();
    placeControl(sim, centre, 'roundabout');
    for (let k = 0; k < ROUNDABOUT_CAPACITY - 1; k++) {
      sim.cars.push(carOn(k, centre, 0.5));
    }
    // One more car fits while the others are clear of the entrance.
    expect(tileOpen(sim, centre, null, EAST)).toBe(true);
    sim.cars.push(carOn(99, centre, 0.5));
    expect(tileOpen(sim, centre, null, EAST)).toBe(false);
  });

  it('refuses while a car is still at its entrance', () => {
    const { sim, centre } = junction();
    placeControl(sim, centre, 'roundabout');
    sim.cars.push(carOn(1, centre, 0.0));
    expect(tileOpen(sim, centre, null, EAST)).toBe(false);
  });
});

describe('a traffic light', () => {
  /** A car on `from`, half way in, about to enter the junction at `centre`. */
  const coming = (id: number, from: number, centre: number): Car => ({
    ...carOn(id, from, 0.5),
    route: [from, centre],
  });

  it('starts with green on the horizontal axis', () => {
    const { sim, centre } = junction();
    placeControl(sim, centre, 'light');
    expect(tileOpen(sim, centre, null, EAST)).toBe(true);
    expect(tileOpen(sim, centre, null, SOUTH)).toBe(false);
  });

  it('switches to cars waiting on red once its green side is empty and the shortest green has passed', () => {
    const { sim, centre, arms } = junction();
    placeControl(sim, centre, 'light');
    sim.cars.push(coming(1, arms[2]!, centre));
    sim.tick = 0;
    updateLights(sim);
    expect(tileOpen(sim, centre, null, SOUTH)).toBe(false);
    sim.tick = LIGHT_MIN_GREEN_TICKS;
    updateLights(sim);
    expect(tileOpen(sim, centre, null, SOUTH)).toBe(true);
    expect(tileOpen(sim, centre, null, EAST)).toBe(false);
  });

  it('keeps its green while no car waits on the red side', () => {
    const { sim, centre, arms } = junction();
    placeControl(sim, centre, 'light');
    sim.cars.push(coming(1, arms[0]!, centre));
    sim.tick = 0;
    updateLights(sim);
    sim.tick = LIGHT_MAX_GREEN_TICKS * 3;
    updateLights(sim);
    expect(tileOpen(sim, centre, null, EAST)).toBe(true);
  });

  it('switches after the longest green when cars wait on both sides', () => {
    const { sim, centre, arms } = junction();
    placeControl(sim, centre, 'light');
    sim.cars.push(coming(1, arms[0]!, centre), coming(2, arms[2]!, centre));
    sim.tick = 0;
    updateLights(sim);
    sim.tick = LIGHT_MIN_GREEN_TICKS;
    updateLights(sim);
    expect(tileOpen(sim, centre, null, EAST)).toBe(true);
    sim.tick = LIGHT_MAX_GREEN_TICKS;
    updateLights(sim);
    expect(tileOpen(sim, centre, null, EAST)).toBe(false);
    expect(tileOpen(sim, centre, null, SOUTH)).toBe(true);
  });

  it('still lets one car at a time through, on its green', () => {
    const { sim, centre } = junction();
    placeControl(sim, centre, 'light');
    sim.tick = 0;
    sim.cars.push(carOn(1, centre, 0.5));
    expect(tileOpen(sim, centre, null, EAST)).toBe(false);
  });
});

describe('roundabout footprint', () => {
  function plain(): SimState {
    const sim = createSim({ seed: 1, grid: makeGrid(7, 7), roadBudget: 80 });
    sim.stock.roundabout = 2;
    return sim;
  }

  it('refuses a roundabout whose ring would cover a building', () => {
    const sim = plain();
    const r = placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 4, 3),
      entrance: 'e',
    });
    expect(r.ok).toBe(true);
    expect(placeControl(sim, at(sim.grid, 3, 3), 'roundabout')).toEqual({
      ok: false,
      reason: 'bad-endpoint',
    });
  });

  it('allows a roundabout beside a building its ring does not reach', () => {
    const sim = plain();
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 4, 4),
      entrance: 's',
    });
    expect(placeControl(sim, at(sim.grid, 3, 3), 'roundabout')).toEqual({
      ok: true,
    });
  });

  it('refuses a roundabout that would overlap another', () => {
    const sim = plain();
    expect(placeControl(sim, at(sim.grid, 3, 3), 'roundabout')).toEqual({
      ok: true,
    });
    expect(placeControl(sim, at(sim.grid, 4, 3), 'roundabout')).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });
});
