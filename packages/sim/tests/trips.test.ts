import { describe, expect, it } from 'vitest';
import {
  addCar,
  CAR_GAP,
  createSim,
  moveCars,
  placeBuilding,
  removeRoads,
  step,
  updateTrips,
  type SimState,
} from '../src/index.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

/** House at (0,2) facing east, destination at (4,2) facing west, road between them on row 2. */
function world(withRoad = true): SimState {
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
  // A few waiting pins, so these tests check travel rather than demand, and stay under the overflow limit.
  sim.demand[1].pins = 2;
  if (withRoad) {
    drawRoads(sim, [
      at(sim.grid, 1, 2),
      at(sim.grid, 2, 2),
      at(sim.grid, 3, 2),
    ]);
  }
  return sim;
}

describe('trips', () => {
  it('sends a car out, which parks at the destination and returns home', () => {
    const sim = world();
    const home = sim.homes[0];
    step(sim);
    const car = sim.cars[0];
    let sawParked = false;
    let ticks = 1;
    while (sim.cars.includes(car) && ticks < 1000) {
      step(sim);
      ticks += 1;
      if (car.state === 'parked') sawParked = true;
    }
    // The car drives 2 tiles (30 ticks), parks PARK_TICKS (60), then drives 2 tiles home.
    expect(sawParked).toBe(true);
    expect(ticks).toBeLessThan(1000);
    expect(home.owned).toBe(2);
    expect(home.atHome).toBe(1); // this car is home; the second is still out
  });

  it('spaces departures by the spawn interval', () => {
    const sim = world();
    step(sim);
    expect(sim.cars).toHaveLength(1);
    expect(sim.homes[0].atHome).toBe(1);
    for (let i = 0; i < 59; i++) step(sim);
    expect(sim.cars).toHaveLength(1);
    step(sim);
    expect(sim.cars).toHaveLength(2);
    expect(sim.homes[0].atHome).toBe(0);
  });

  it('keeps its cars at home when no destination is connected', () => {
    const sim = world(true);
    removeRoads(sim, [at(sim.grid, 3, 2)]); // cut the destination off
    for (let i = 0; i < 200; i++) step(sim);
    expect(sim.cars).toHaveLength(0);
    expect(sim.homes[0].atHome).toBe(2);
  });

  it('queues a car behind one parked on the destination entrance', () => {
    const sim = world();
    const route = [at(sim.grid, 1, 2), at(sim.grid, 2, 2), at(sim.grid, 3, 2)];
    const parked = addCar(sim, 0, 1);
    const queued = addCar(sim, 0, 1);
    if (!parked.ok || !queued.ok) throw new Error('setup failed');
    const [a, b] = [sim.cars[0], sim.cars[1]];
    a.state = 'parked';
    a.progress = route.length - 1;
    a.along = 1;
    a.timer = 1000;
    b.progress = 0;
    b.along = 0;

    for (let i = 0; i < 200; i++) {
      moveCars(sim);
      updateTrips(sim);
    }
    expect(sim.cars).toContain(a);
    expect(b.state).toBe('driving');
    expect(b.progress).toBe(route.length - 1);
    expect(b.along).toBeCloseTo(a.along - CAR_GAP, 6);
  });

  it('a car that loses its way home is dropped, and its house owns one fewer', () => {
    // House (0,2) → (1,2), (2,2), (3,3), (3,4) → destination at (4,4) entered from (3,4).
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
      tile: at(sim.grid, 4, 4),
      entrance: 'w',
    });
    drawRoads(sim, [
      at(sim.grid, 1, 2),
      at(sim.grid, 2, 2),
      at(sim.grid, 3, 2),
      at(sim.grid, 3, 3),
      at(sim.grid, 3, 4),
    ]);
    addCar(sim, 0, 1);
    sim.cars[0].progress = 2; // on (3,3)
    removeRoads(sim, [
      at(sim.grid, 1, 2),
      at(sim.grid, 2, 2),
      at(sim.grid, 3, 3),
    ]);
    expect(sim.cars).toHaveLength(0);
    expect(sim.homes[0].owned).toBe(1);
  });
});
