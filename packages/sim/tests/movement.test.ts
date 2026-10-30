import { describe, expect, it } from 'vitest';
import {
  CAR_GAP,
  CAR_SPEED,
  createSim,
  moveCars,
  placeRoads,
  step,
  type Car,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/** A straight row of road across a 9×5 world, on row 2. */
function row(): { sim: SimState; route: number[] } {
  const sim = createSim({ seed: 1, grid: makeGrid(9, 5), roadBudget: 100 });
  const route = Array.from({ length: 9 }, (_, x) => at(sim.grid, x, 2));
  placeRoads(sim, route);
  return { sim, route };
}

function carOn(sim: SimState, route: number[], progress = 0, along = 0): Car {
  const car: Car = {
    id: sim.nextCarId,
    house: 0,
    destination: 1,
    state: 'driving',
    route,
    progress,
    along,
  };
  sim.nextCarId += 1;
  sim.cars.push(car);
  return car;
}

/** Distance travelled along the car's route, in tiles. */
const dist = (car: Car) => car.progress + car.along;

describe('car movement', () => {
  it('moves a car at the car speed', () => {
    const { sim, route } = row();
    const car = carOn(sim, route);
    for (let i = 0; i < 30; i++) step(sim);
    expect(dist(car)).toBeCloseTo(CAR_SPEED, 6);
  });

  it('stops at the end of its route', () => {
    const { sim, route } = row();
    const car = carOn(sim, route);
    for (let i = 0; i < 1000; i++) step(sim);
    expect(car.progress).toBe(route.length - 1);
    expect(car.along).toBeCloseTo(1, 6);
  });

  it('keeps at least the gap behind the car ahead, every tick', () => {
    const { sim, route } = row();
    const lead = carOn(sim, route, 3, 0.5);
    const follower = carOn(sim, route, 0, 0);
    for (let i = 0; i < 400; i++) {
      step(sim);
      expect(dist(lead) - dist(follower)).toBeGreaterThanOrEqual(
        CAR_GAP - 1e-9,
      );
    }
  });

  it('queues a follower one gap behind a car that has stopped', () => {
    const { sim, route } = row();
    const lead = carOn(sim, route, 7, 0);
    const follower = carOn(sim, route, 4, 0);
    for (let i = 0; i < 600; i++) step(sim);
    expect(lead.progress).toBe(route.length - 1);
    expect(dist(follower)).toBeCloseTo(dist(lead) - CAR_GAP, 6);
  });

  it('is deterministic for the same starting cars', () => {
    const run = () => {
      const { sim, route } = row();
      carOn(sim, route, 3, 0.5);
      carOn(sim, route, 0, 0);
      for (let i = 0; i < 200; i++) moveCars(sim);
      return sim.cars.map((c) => ({ p: c.progress, a: c.along }));
    };
    expect(run()).toEqual(run());
  });
});

describe('junctions', () => {
  it('lets one car at a time cross, and the car that arrives first goes first', () => {
    // A plus of roads on a 5×5 grid, centred on (2,2).
    const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 100 });
    const across = Array.from({ length: 5 }, (_, x) => at(sim.grid, x, 2));
    const down = Array.from({ length: 5 }, (_, y) => at(sim.grid, 2, y));
    placeRoads(sim, [...across, ...down]);
    const centre = at(sim.grid, 2, 2);

    // Both cars are one tile from the centre, so the lower id gets there first.
    const east = carOn(sim, across, 1, 0); // id 0
    const south = carOn(sim, down, 1, 0); // id 1

    let firstExit: number | null = null;
    for (let i = 0; i < 300; i++) {
      step(sim);
      const onCentre = sim.cars.filter(
        (c) => c.route[c.progress] === centre,
      ).length;
      expect(onCentre).toBeLessThanOrEqual(1);
      for (const c of [east, south]) {
        if (firstExit === null && c.progress >= 3) firstExit = c.id;
      }
    }

    expect(firstExit).toBe(east.id);
    // Both get through in the end.
    expect(east.progress).toBe(across.length - 1);
    expect(south.progress).toBe(down.length - 1);
  });
});
