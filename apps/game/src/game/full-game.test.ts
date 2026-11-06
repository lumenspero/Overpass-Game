import {
  chooseOffer,
  createSim,
  placeBuilding,
  step,
  UPGRADE_KINDS,
  WEEK_TICKS,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { buildTestFence, buildTestGrid, TEST_BUILDINGS } from './test-map.ts';

/**
 * Checkpoint B smoke test: a full-length game on the test map with every upgrade in stock
 * from the start, run to the end of week 8. The game must run without throwing, keep its
 * tick count and stay in a valid state. Balance is for playtesting, not this test.
 */
describe('a full game with every upgrade', () => {
  it('runs eight weeks with every upgrade in stock without throwing', () => {
    const grid = buildTestGrid();
    const sim = createSim({
      seed: 1,
      grid,
      startFence: buildTestFence(),
    });
    for (const b of TEST_BUILDINGS) {
      const r = placeBuilding(sim, {
        kind: b.kind,
        color: b.color,
        tile: b.row * grid.cols + b.col,
        entrance: b.entrance,
      });
      if (!r.ok) throw new Error(`test building refused: ${r.reason}`);
    }
    for (const kind of UPGRADE_KINDS) sim.stock[kind] = 3;
    // The clock waits while an offer is open, so the run takes the first option each week.
    for (let t = 0; t < 8 * WEEK_TICKS && !sim.over; t++) {
      const [first] = sim.offers;
      if (first) chooseOffer(sim, first[0]);
      step(sim);
    }
    expect(sim.tick === 8 * WEEK_TICKS || sim.over !== null).toBe(true);
    expect(sim.budget).toBeGreaterThanOrEqual(0);
    expect(sim.tripsCompleted).toBeGreaterThanOrEqual(0);
  });
});
