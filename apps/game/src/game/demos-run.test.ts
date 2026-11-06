import { chooseOffer, step } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { buildDemo, DEMOS } from './demos.ts';

describe('the scripted demos run', () => {
  for (const demo of DEMOS) {
    it(`${demo.id} runs for 3000 ticks without throwing`, () => {
      const sim = buildDemo(demo.id);
      // The clock waits while an offer is open, so the run takes the first option each week.
      for (let t = 0; t < 3000 && !sim.over; t++) {
        const [first] = sim.offers;
        if (first) chooseOffer(sim, first[0]);
        step(sim);
      }
      // A demo the player has not solved can end early by overflow, which is a game over, not a hang.
      expect(sim.tick === 3000 || sim.over !== null).toBe(true);
    }, 30_000);
  }
});
