import { describe, expect, it } from 'vitest';
import {
  createGrid,
  createSim,
  grantWeeklyReward,
  OFFER_IDS,
  offerCandidates,
  type MapRule,
  type OfferId,
} from '../src/index.ts';

const grid = createGrid(8, 8);

function sim(rules: MapRule[] = []) {
  return createSim({ seed: 3, grid, roadBudget: 80, rules });
}

describe('per-map offer rules', () => {
  it('allows every offer when the map has no allowedOffers rule', () => {
    expect(offerCandidates(sim())).toEqual([...OFFER_IDS]);
  });

  it('leaves out the options a map does not allow, but keeps road tiles', () => {
    const candidates = offerCandidates(
      sim([{ kind: 'allowedOffers', options: ['motorway', 'lights'] }]),
    );
    expect(candidates).toEqual(['motorway', 'lights', 'tiles']);
  });

  it('never offers a banned option, and always gives a choice of two', () => {
    const state = sim([
      { kind: 'allowedOffers', options: ['bridge', 'roundabout'] },
    ]);
    const candidates = offerCandidates(state);
    const seen = new Set<OfferId>();
    for (let week = 0; week < 200; week++) {
      state.offers = [];
      grantWeeklyReward(state, candidates);
      expect(state.offers).toHaveLength(1);
      for (const id of state.offers[0]) seen.add(id);
    }
    expect(seen.has('tunnel')).toBe(false);
    expect(seen.has('motorway')).toBe(false);
    expect(seen.has('lights')).toBe(false);
    expect(seen.has('tiles')).toBe(true);
  });
});
