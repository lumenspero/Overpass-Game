import { afterEach, describe, expect, it } from 'vitest';
import {
  createSim,
  createRng,
  drawChoices,
  grantWeeklyReward,
  resetTuning,
  step,
  tuning,
  type UpgradeKind,
} from '../src/index.ts';
import { makeGrid } from './helpers.ts';

afterEach(() => resetTuning());

describe('the weekly road reward', () => {
  it('adds nothing before the first week boundary', () => {
    tuning.WEEK_TICKS = 100;
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    for (let i = 0; i < 99; i++) step(sim);
    expect(sim.budget).toBe(0);
  });

  it('adds WEEKLY_ROAD_REWARD at each week boundary', () => {
    tuning.WEEK_TICKS = 100;
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    for (let i = 0; i < 250; i++) step(sim);
    expect(sim.budget).toBe(2 * tuning.WEEKLY_ROAD_REWARD);
  });

  it('is not given once the game is over', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    sim.over = { tick: 0, destination: 0 };
    grantWeeklyReward(sim, ['bridge', 'tunnel']);
    expect(sim.budget).toBe(0);
    expect(sim.offers).toEqual([]);
  });

  it('queues an offer of two different kinds when enough are implemented', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    grantWeeklyReward(sim, ['bridge', 'tunnel', 'light']);
    expect(sim.offers).toHaveLength(1);
    const [offer] = sim.offers;
    expect(offer).toHaveLength(2);
    expect(new Set(offer).size).toBe(2);
  });

  it('queues no offer when fewer than two kinds are implemented', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    grantWeeklyReward(sim, ['bridge']);
    expect(sim.budget).toBe(tuning.WEEKLY_ROAD_REWARD);
    expect(sim.offers).toEqual([]);
  });
});

describe('drawChoices', () => {
  it('never draws a kind whose weight is zero', () => {
    tuning.UPGRADE_WEIGHT_BRIDGE = 0;
    const picks = drawChoices(createRng(7), ['bridge', 'tunnel']);
    expect(picks).toEqual(['tunnel']);
  });

  it('returns no picks when no candidate has weight', () => {
    tuning.UPGRADE_WEIGHT_BRIDGE = 0;
    tuning.UPGRADE_WEIGHT_TUNNEL = 0;
    const rng = createRng(7);
    expect(drawChoices(rng, ['bridge', 'tunnel'])).toEqual([]);
    expect(rng.state).toBe(createRng(7).state);
  });

  it('favours heavier kinds in proportion to their weights', () => {
    tuning.UPGRADE_WEIGHT_BRIDGE = 9;
    tuning.UPGRADE_WEIGHT_TUNNEL = 1;
    let bridgeFirst = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const [first] = drawChoices(createRng(seed), ['bridge', 'tunnel'], 1);
      if (first === 'bridge') bridgeFirst += 1;
    }
    expect(bridgeFirst).toBeGreaterThan(850);
    expect(bridgeFirst).toBeLessThan(950);
  });

  it('gives the same picks for the same seed', () => {
    const kinds: UpgradeKind[] = ['bridge', 'tunnel', 'motorway', 'light'];
    expect(drawChoices(createRng(42), kinds)).toEqual(
      drawChoices(createRng(42), kinds),
    );
  });
});
