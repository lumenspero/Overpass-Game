import { describe, expect, it } from 'vitest';
import {
  createSim,
  nextFloat,
  placeBuilding,
  placeRoads,
  removeRoads,
  step,
  type SimState,
} from '../src/index.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

/**
 * An 8×8 town as in cars.test: a house at (0,2) facing east and a destination at (3,3) facing north,
 * joined by a drawn road through the house entrance (1,2) and the destination inlet (3,2).
 */
function town(seed: number): SimState {
  const sim = createSim({ seed, grid: makeGrid(8, 8), roadBudget: 100 });
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
  drawRoads(
    sim,
    [1, 2, 3].map((x) => at(sim.grid, x, 2)),
  );
  return sim;
}

/** Plays ticks from `from` to `to`, with the same inputs for the same tick every time. */
function play(sim: SimState, from: number, to: number): void {
  for (let k = from; k < to; k++) {
    if (k % 40 === 0) placeRoads(sim, [Math.floor(nextFloat(sim.rng) * 64)]);
    if (k % 97 === 0) removeRoads(sim, [Math.floor(nextFloat(sim.rng) * 64)]);
    step(sim);
  }
}

describe('save round trip', () => {
  it('a run saved mid-game and reloaded carries on exactly as the original', () => {
    const original = town(11);
    play(original, 0, 1200);
    const reloaded = JSON.parse(JSON.stringify(original)) as SimState;

    play(original, 1200, 2400);
    play(reloaded, 1200, 2400);

    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(original));
    expect(original.tick).toBe(2400);
    expect(original.over).toBeNull();
  });

  it('the saved state includes the cars and demand that a run builds up', () => {
    const sim = town(11);
    play(sim, 0, 2400);
    expect(sim.buildings).toHaveLength(2);
    expect(sim.tripsCompleted + sim.cars.length).toBeGreaterThan(0);
  });
});
