import { describe, expect, it } from 'vitest';
import {
  addCar,
  createSim,
  linkTiles,
  placeBuilding,
  removeRoads,
  type SimState,
} from '../src/index.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

/**
 * An 8×8 world with a house at (0,2) facing east and a destination at (3,3) facing north. Its
 * 3×3 building sits in a 5×3 lot at columns 3-7, rows 3-5. The house's entrance is (1,2) and
 * the destination's inlet road is (3,2).
 */
function world(): SimState {
  const sim = createSim({ seed: 1, grid: makeGrid(8, 8), roadBudget: 100 });
  placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(sim.grid, 0, 2),
    entrance: 'e',
  });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(sim.grid, 3, 3),
    entrance: 'n',
  });
  return sim;
}

const t = (sim: SimState, x: number, y: number) => at(sim.grid, x, y);

describe('addCar', () => {
  it('plans a route from the house entrance to the destination entrance', () => {
    const sim = world();
    drawRoads(sim, [t(sim, 1, 2), t(sim, 2, 2), t(sim, 3, 2)]);
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
    // The house always has its stub, so leave the destination's road out instead.
    drawRoads(sim, [t(sim, 1, 2), t(sim, 2, 2)]);
    expect(addCar(sim, 0, 1)).toEqual({ ok: false, reason: 'not-connected' });
  });

  it('refuses when there is no route between the buildings', () => {
    const sim = world();
    drawRoads(sim, [t(sim, 1, 2), t(sim, 3, 2)]);
    expect(addCar(sim, 0, 1)).toEqual({ ok: false, reason: 'no-route' });
  });

  it('refuses a destination used as a house, or an unknown building', () => {
    const sim = world();
    drawRoads(sim, [t(sim, 1, 2), t(sim, 2, 2), t(sim, 3, 2)]);
    expect(addCar(sim, 1, 0)).toEqual({ ok: false, reason: 'bad-building' });
    expect(addCar(sim, 0, 9)).toEqual({ ok: false, reason: 'bad-building' });
  });
});

describe('cars when roads change', () => {
  function driving(): SimState {
    const sim = world();
    drawRoads(sim, [t(sim, 1, 2), t(sim, 2, 2), t(sim, 3, 2)]);
    addCar(sim, 0, 1);
    return sim;
  }

  it('leaves a car alone when a road off its route is removed', () => {
    const sim = driving();
    drawRoads(sim, [t(sim, 2, 1)]);
    const before = sim.cars[0].route;
    removeRoads(sim, [t(sim, 2, 1)]);
    expect(sim.cars[0]).toMatchObject({ state: 'driving', route: before });
  });

  it('reroutes a driving car around a deleted road when an alternative exists', () => {
    const sim = driving();
    // The detour starts and ends on the existing road, so the drag links it at both ends.
    drawRoads(sim, [
      t(sim, 1, 2),
      t(sim, 1, 1),
      t(sim, 1, 0),
      t(sim, 2, 0),
      t(sim, 3, 0),
      t(sim, 3, 1),
      t(sim, 3, 2),
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
    // House (0,2) → (1,2), (2,2), (3,3), (3,4) → destination at (3,5), its inlet road (3,4).
    const sim = createSim({ seed: 1, grid: makeGrid(8, 8), roadBudget: 100 });
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: t(sim, 0, 2),
      entrance: 'e',
    });
    placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: t(sim, 3, 5),
      entrance: 'n',
    });
    drawRoads(sim, [
      t(sim, 1, 2),
      t(sim, 2, 2),
      t(sim, 3, 2),
      t(sim, 3, 3),
      t(sim, 3, 4),
    ]);
    addCar(sim, 0, 1);
    // (2,2) and (3,3) touch at a corner but no drag linked them, so the car goes via (3,2).
    expect(sim.cars[0].route).toEqual([
      t(sim, 1, 2),
      t(sim, 2, 2),
      t(sim, 3, 2),
      t(sim, 3, 3),
      t(sim, 3, 4),
    ]);
    sim.cars[0].progress = 3; // on (3,3)
    // Cut the car's own tile and the link home: it is left with no road to its house.
    removeRoads(sim, [t(sim, 1, 2), t(sim, 2, 2), t(sim, 3, 3)]);
    expect(sim.cars).toHaveLength(0);
  });

  it('a driving car takes a shorter route when a road is added', () => {
    const sim = world();
    // A detour drawn by corner steps: (1,2)→(2,3)→(3,2), linked across each corner.
    drawRoads(sim, [t(sim, 1, 2), t(sim, 2, 3), t(sim, 3, 2)]);
    linkTiles(sim, t(sim, 1, 2), t(sim, 2, 3));
    linkTiles(sim, t(sim, 2, 3), t(sim, 3, 2));
    addCar(sim, 0, 1);
    expect(sim.cars[0].route).toEqual([
      t(sim, 1, 2),
      t(sim, 2, 3),
      t(sim, 3, 2),
    ]);
    drawRoads(sim, [t(sim, 1, 2), t(sim, 2, 2), t(sim, 3, 2)]);
    expect(sim.cars[0].route).toEqual([
      t(sim, 1, 2),
      t(sim, 2, 2),
      t(sim, 3, 2),
    ]);
  });

  it('a car keeps its route when a new road does not shorten it', () => {
    const sim = driving();
    const before = sim.cars[0].route;
    drawRoads(sim, [t(sim, 2, 1)]);
    expect(sim.cars[0].route).toEqual(before);
  });
});
