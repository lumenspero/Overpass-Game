import { describe, expect, it } from 'vitest';
import {
  DEMAND_INTERVAL_TICKS,
  createSim,
  placeBuilding,
  placeRoads,
  removeRoads,
  step,
  unclaimedPins,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

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
  if (withRoad) {
    placeRoads(sim, [
      at(sim.grid, 1, 2),
      at(sim.grid, 2, 2),
      at(sim.grid, 3, 2),
    ]);
  }
  return sim;
}

function runSteps(sim: SimState, n: number): void {
  for (let i = 0; i < n; i++) step(sim);
}

describe('demand pins', () => {
  it('a destination collects one pin per interval, starting after the first interval', () => {
    const sim = world(false);
    sim.demand[1].pins = 0;
    runSteps(sim, DEMAND_INTERVAL_TICKS - 1);
    expect(sim.demand[1].pins).toBe(0);
    runSteps(sim, 1);
    expect(sim.demand[1].pins).toBe(1);
    runSteps(sim, DEMAND_INTERVAL_TICKS);
    expect(sim.demand[1].pins).toBe(2);
  });

  it('a destination collects pins whether or not it is connected', () => {
    const sim = world(false);
    runSteps(sim, DEMAND_INTERVAL_TICKS);
    expect(sim.demand[1].pins).toBe(1);
    expect(sim.cars).toHaveLength(0);
  });

  it('a house sends no car until its destination has a pin', () => {
    const sim = world(true);
    sim.demand[1].pins = 0;
    runSteps(sim, DEMAND_INTERVAL_TICKS - 1);
    expect(sim.cars).toHaveLength(0);
    expect(sim.homes[0].atHome).toBe(2);
    step(sim);
    expect(sim.cars).toHaveLength(1);
  });

  it('one pin is never sent to two cars at once', () => {
    const sim = world(true);
    sim.demand[1].pins = 1;
    step(sim);
    expect(sim.cars).toHaveLength(1);
    expect(unclaimedPins(sim, 1)).toBe(0);
    // Let the house's own cooldown be ready every tick, so only the pin can stop it.
    for (let i = 0; i < 10; i++) {
      sim.homes[0].cooldown = 0;
      step(sim);
    }
    expect(sim.cars).toHaveLength(1);
  });

  it('a pin is used up when its car arrives', () => {
    const sim = world(true);
    sim.demand[1].pins = 1;
    step(sim);
    const car = sim.cars[0];
    for (let i = 0; i < 200 && car.state === 'driving'; i++) step(sim);
    expect(car.state).not.toBe('driving');
    expect(sim.demand[1].pins).toBe(0);
  });

  it('a car that goes home without arriving keeps its pin for the next car', () => {
    const sim = world(true);
    sim.demand[1].pins = 1;
    step(sim);
    // Cut the destination off while the car is still heading there.
    removeRoads(sim, [at(sim.grid, 3, 2)]);
    expect(sim.cars[0].state).toBe('returning');
    expect(sim.demand[1].pins).toBe(1);
    expect(unclaimedPins(sim, 1)).toBe(1);
  });
});
