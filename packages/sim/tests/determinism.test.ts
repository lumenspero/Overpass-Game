import { describe, expect, it } from 'vitest';
import {
  createSim,
  nextFloat,
  placeRoads,
  removeRoads,
  step,
  type SimState,
} from '../src/index.ts';
import { makeGrid } from './helpers.ts';

/** Same seed and same inputs must produce identical state. */
function run(seed: number): SimState {
  const sim = createSim({ seed, grid: makeGrid(12, 12), roadBudget: 500 });
  for (let t = 0; t < 200; t++) {
    const tile = Math.floor(nextFloat(sim.rng) * 144);
    if (t % 3 === 0) placeRoads(sim, [tile, (tile + 1) % 144]);
    else if (t % 7 === 0) removeRoads(sim, [tile]);
    step(sim);
  }
  return sim;
}

describe('determinism', () => {
  it('two runs with the same seed produce identical state', () => {
    expect(JSON.stringify(run(31337))).toBe(JSON.stringify(run(31337)));
  });

  it('a different seed produces different state', () => {
    expect(JSON.stringify(run(1))).not.toBe(JSON.stringify(run(2)));
  });

  it('state survives a JSON round trip', () => {
    const sim = run(5);
    const restored = JSON.parse(JSON.stringify(sim)) as SimState;
    expect(restored).toEqual(sim);
  });
});
