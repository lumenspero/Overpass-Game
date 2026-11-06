import { afterEach, describe, expect, it } from 'vitest';
import {
  createSim,
  generateDemand,
  placeBuilding,
  resetTuning,
  step,
  tuning,
  WEEK_TICKS,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

afterEach(() => resetTuning());

/** A map with a house and a destination, both colour 0, and the destination's id. */
function town(rules: Parameters<typeof createSim>[0]['rules'] = []) {
  const grid = makeGrid(9, 9);
  const sim: SimState = createSim({ seed: 1, grid, roadBudget: 80, rules });
  const house = placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(grid, 1, 1),
    entrance: 'e',
  });
  const dest = placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(grid, 4, 6),
    entrance: 'n',
  });
  if (!house.ok || !dest.ok) throw new Error('setup failed');
  return { sim, destId: dest.id, houseId: house.id };
}

/** Ticks one pin takes to appear at the given rate, from a cooldown of 1. */
function pinOnNextTick(sim: SimState, destId: number): number {
  const demand = sim.demand[destId];
  demand.cooldown = 1;
  generateDemand(sim);
  return demand.cooldown;
}

describe('destination growth', () => {
  it('raises every destination once a week, in every week', () => {
    const { sim, destId } = town();
    sim.tick = WEEK_TICKS - 1;
    step(sim);
    expect(sim.demand[destId].growth).toBe(1);
    sim.offers = []; // the player answers the week's offer, so the clock runs on
    sim.tick = 2 * WEEK_TICKS - 1;
    step(sim);
    expect(sim.demand[destId].growth).toBe(2);
  });

  it('makes the next pin come sooner as demand grows', () => {
    const { sim, destId } = town();
    expect(pinOnNextTick(sim, destId)).toBe(tuning.DEMAND_INTERVAL_TICKS);
    sim.demand[destId].growth = 1;
    const expected = Math.round(
      tuning.DEMAND_INTERVAL_TICKS / (1 + tuning.DEMAND_GROWTH_STEP),
    );
    expect(pinOnNextTick(sim, destId)).toBe(expected);
  });
});
