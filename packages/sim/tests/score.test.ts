import { describe, expect, it } from 'vitest';
import {
  createSim,
  OVERFLOW_PIN_LIMIT,
  placeBuilding,
  removeRoads,
  step,
  summaryOf,
  ticksLeftInWeek,
  WEEK_TICKS,
  weekOf,
  type SimState,
} from '../src/index.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

/** House at (0,2), destination at (4,2), road between them on row 2. */
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
  drawRoads(sim, [at(sim.grid, 1, 2), at(sim.grid, 2, 2), at(sim.grid, 3, 2)]);
  return sim;
}

describe('the week clock', () => {
  it('starts in week 1 and moves on at each week boundary', () => {
    expect(weekOf(0)).toBe(1);
    expect(weekOf(WEEK_TICKS - 1)).toBe(1);
    expect(weekOf(WEEK_TICKS)).toBe(2);
    expect(weekOf(3 * WEEK_TICKS)).toBe(4);
  });

  it('counts the ticks left in the current week', () => {
    expect(ticksLeftInWeek(0)).toBe(WEEK_TICKS);
    expect(ticksLeftInWeek(WEEK_TICKS - 1)).toBe(1);
    expect(ticksLeftInWeek(WEEK_TICKS)).toBe(WEEK_TICKS);
  });
});

describe('the score', () => {
  it('counts a trip when its car arrives at the destination', () => {
    const sim = world();
    sim.demand[1].pins = 1;
    expect(sim.tripsCompleted).toBe(0);
    step(sim);
    const car = sim.cars[0];
    for (let i = 0; i < 100 && car.state === 'driving'; i++) step(sim);
    expect(car.state).not.toBe('driving');
    expect(sim.tripsCompleted).toBe(1);
  });

  it('does not count a car that is sent home without arriving', () => {
    const sim = world();
    sim.demand[1].pins = 1;
    step(sim);
    // Cut the destination off before the car gets there.
    removeRoads(sim, [at(sim.grid, 3, 2)]);
    expect(sim.cars[0].state).toBe('returning');
    for (let i = 0; i < 200; i++) step(sim);
    expect(sim.tripsCompleted).toBe(0);
  });
});

describe('the game summary', () => {
  it('reports the week, trips, and no end while the game runs', () => {
    const sim = world();
    expect(summaryOf(sim)).toEqual({ week: 1, trips: 0, over: null });
  });

  it('reports how the game ended once it is over', () => {
    // A destination with no house, so no car arrives to use up its pins and end the overflow early.
    const sim = createSim({ seed: 1, grid: makeGrid(5, 5), roadBudget: 0 });
    placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 4, 2),
      entrance: 'w',
    });
    sim.demand[0].pins = OVERFLOW_PIN_LIMIT + 1;
    while (sim.over === null) step(sim);
    const summary = summaryOf(sim);
    expect(summary.over).toEqual(sim.over);
    expect(summary.week).toBe(weekOf(sim.over!.tick));
  });
});
