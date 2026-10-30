import { describe, expect, it } from 'vitest';
import {
  addCar,
  createSim,
  placeBuilding,
  placeRoads,
  removeRoads,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/**
 * A 5×5 world with a house at (0,2) facing east and a destination at (4,2) facing west.
 * Their entrances are (1,2) and (3,2).
 */
function world(): SimState {
  const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 100 });
  placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(sim.grid, 0, 2),
    entrance: 'e',
  });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(sim.grid, 4, 2),
    entrance: 'w',
  });
  return sim;
}

const t = (sim: SimState, x: number, y: number) => at(sim.grid, x, y);

describe('addCar', () => {
  it('plans a route from the house entrance to the destination entrance', () => {
    const sim = world();
    placeRoads(sim, [t(sim, 1, 2), t(sim, 2, 2), t(sim, 3, 2)]);
    expect(addCar(sim, 0, 1)).toEqual({ ok: true, id: 0 });
    expect(sim.cars[0]).toMatchObject({
      house: 0,
      destination: 1,
      state: 'driving',
      progress: 0,
      route: [t(sim, 1, 2), t(sim, 2, 2), t(sim, 3, 2)],
    });
  });

  it('refuses when a building is not connected', () => {
    const sim = world();
    placeRoads(sim, [t(sim, 2, 2), t(sim, 3, 2)]);
    expect(addCar(sim, 0, 1)).toEqual({ ok: false, reason: 'not-connected' });
  });

  it('refuses when there is no route between the buildings', () => {
    const sim = world();
    placeRoads(sim, [t(sim, 1, 2), t(sim, 3, 2)]);
    expect(addCar(sim, 0, 1)).toEqual({ ok: false, reason: 'no-route' });
  });

  it('refuses a destination used as a house, or an unknown building', () => {
    const sim = world();
    placeRoads(sim, [t(sim, 1, 2), t(sim, 2, 2), t(sim, 3, 2)]);
    expect(addCar(sim, 1, 0)).toEqual({ ok: false, reason: 'bad-building' });
    expect(addCar(sim, 0, 9)).toEqual({ ok: false, reason: 'bad-building' });
  });
});

describe('cars when roads change', () => {
  function driving(): SimState {
    const sim = world();
    placeRoads(sim, [t(sim, 1, 2), t(sim, 2, 2), t(sim, 3, 2)]);
    addCar(sim, 0, 1);
    return sim;
  }

  it('leaves a car alone when a road off its route is removed', () => {
    const sim = driving();
    placeRoads(sim, [t(sim, 2, 1)]);
    const before = sim.cars[0].route;
    removeRoads(sim, [t(sim, 2, 1)]);
    expect(sim.cars[0]).toMatchObject({ state: 'driving', route: before });
  });

  it('reroutes a driving car around a deleted road when an alternative exists', () => {
    const sim = driving();
    placeRoads(sim, [
      t(sim, 1, 1),
      t(sim, 1, 0),
      t(sim, 2, 0),
      t(sim, 3, 0),
      t(sim, 3, 1),
    ]);
    removeRoads(sim, [t(sim, 2, 2)]);
    expect(sim.cars).toHaveLength(1);
    expect(sim.cars[0].state).toBe('driving');
    expect(sim.cars[0].route).not.toContain(t(sim, 2, 2));
    expect(sim.cars[0].route.at(-1)).toBe(t(sim, 3, 2));
  });

  it('sends a car home when its route is cut and it has no other way to its destination', () => {
    const sim = driving();
    removeRoads(sim, [t(sim, 2, 2)]);
    expect(sim.cars[0].state).toBe('returning');
    expect(sim.cars[0].route.at(-1)).toBe(t(sim, 1, 2));
  });

  it('sends a car home when the tile it is on is deleted', () => {
    const sim = driving();
    sim.cars[0].progress = 1; // on (2,2)
    removeRoads(sim, [t(sim, 2, 2)]);
    expect(sim.cars[0].state).toBe('returning');
    expect(sim.cars[0].route.at(-1)).toBe(t(sim, 1, 2));
  });

  it('removes a car that cannot reach home from where it stands', () => {
    // House (0,2) → (1,2)…(3,2) → down (3,3) → destination at (4,4) entered from (3,4).
    const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 100 });
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: t(sim, 0, 2),
      entrance: 'e',
    });
    placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: t(sim, 4, 4),
      entrance: 'w',
    });
    placeRoads(sim, [
      t(sim, 1, 2),
      t(sim, 2, 2),
      t(sim, 3, 2),
      t(sim, 3, 3),
      t(sim, 3, 4),
    ]);
    addCar(sim, 0, 1);
    sim.cars[0].progress = 3; // on (3,3)
    // Cut the link home and the car's own tile: the car is left with no road to its house.
    removeRoads(sim, [t(sim, 2, 2), t(sim, 3, 3)]);
    expect(sim.cars).toHaveLength(0);
  });

  it('a driving car takes a shorter route when a road is added', () => {
    const sim = world();
    placeRoads(sim, [
      t(sim, 1, 2),
      t(sim, 1, 1),
      t(sim, 1, 0),
      t(sim, 2, 0),
      t(sim, 3, 0),
      t(sim, 3, 1),
      t(sim, 3, 2),
    ]);
    addCar(sim, 0, 1);
    expect(sim.cars[0].route).toHaveLength(7);
    placeRoads(sim, [t(sim, 2, 2)]);
    expect(sim.cars[0].route).toEqual([
      t(sim, 1, 2),
      t(sim, 2, 2),
      t(sim, 3, 2),
    ]);
  });

  it('a car keeps its route when a new road does not shorten it', () => {
    const sim = driving();
    const before = sim.cars[0].route;
    placeRoads(sim, [t(sim, 2, 1)]);
    expect(sim.cars[0].route).toEqual(before);
  });
});
