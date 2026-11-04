import { afterEach, describe, expect, it } from 'vitest';
import {
  chooseOffer,
  createSim,
  createRng,
  drawChoices,
  grantWeeklyReward,
  OFFER_OPTIONS,
  resetTuning,
  step,
  tuning,
  type OfferId,
} from '../src/index.ts';
import { makeGrid } from './helpers.ts';

afterEach(() => resetTuning());

describe('the weekly offer', () => {
  it('queues nothing before the first week boundary', () => {
    tuning.WEEK_TICKS = 100;
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    for (let i = 0; i < 99; i++) step(sim);
    expect(sim.offers).toEqual([]);
  });

  it('gives no tiles at a week boundary; the tiles come with the choice', () => {
    tuning.WEEK_TICKS = 100;
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    for (let i = 0; i < 250; i++) step(sim);
    expect(sim.budget).toBe(0);
    expect(sim.offers).toHaveLength(1);
  });

  it('pauses the clock while an offer waits', () => {
    tuning.WEEK_TICKS = 100;
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    for (let i = 0; i < 100; i++) step(sim);
    expect(sim.tick).toBe(100);
    sim.offers = [['bridge', 'tunnel']];
    for (let i = 0; i < 50; i++) step(sim);
    expect(sim.tick).toBe(100);
    chooseOffer(sim, 'bridge');
    step(sim);
    expect(sim.tick).toBe(101);
  });

  it('is not given once the game is over', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    sim.over = { tick: 0, destination: 0 };
    grantWeeklyReward(sim, ['bridge', 'tunnel']);
    expect(sim.offers).toEqual([]);
  });

  it('queues an offer of two different options', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    grantWeeklyReward(sim, ['bridge', 'tunnel', 'lights']);
    expect(sim.offers).toHaveLength(1);
    const [offer] = sim.offers;
    expect(offer).toHaveLength(2);
    expect(new Set(offer).size).toBe(2);
  });

  it('always keeps road tiles on offer, so a restricted map still gives a choice', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    grantWeeklyReward(sim, ['bridge']);
    expect(sim.offers).toHaveLength(1);
    expect(sim.offers[0]).toContain('tiles');
  });
});

describe('chooseOffer', () => {
  const offered: OfferId[] = ['bridge', 'tunnel'];

  it('gives an option its upgrades and its tiles', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    sim.offers = [['motorway', 'lights']];
    expect(chooseOffer(sim, 'motorway')).toEqual({ ok: true });
    expect(sim.stock.motorway).toBe(1);
    expect(sim.budget).toBe(10);
    expect(sim.offers).toEqual([]);
  });

  it('gives two traffic lights for the lights option', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    sim.offers = [['lights', 'tiles']];
    chooseOffer(sim, 'lights');
    expect(sim.stock.light).toBe(2);
    expect(sim.budget).toBe(20);
  });

  it('gives tiles only for the tiles option', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    sim.offers = [['tiles', 'bridge']];
    chooseOffer(sim, 'tiles');
    expect(sim.budget).toBe(30);
    expect(sim.stock).toEqual({
      bridge: 0,
      tunnel: 0,
      motorway: 0,
      roundabout: 0,
      light: 0,
    });
  });

  it('refuses an option that was not offered, and leaves the offer open', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    sim.offers = [offered];
    expect(chooseOffer(sim, 'lights')).toEqual({
      ok: false,
      reason: 'not-offered',
    });
    expect(sim.offers).toHaveLength(1);
  });

  it('refuses when there is no offer', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(3, 3), roadBudget: 0 });
    expect(chooseOffer(sim, 'bridge')).toEqual({
      ok: false,
      reason: 'no-offer',
    });
  });

  it('matches the spec table: six options, tile amounts 10, 20, 20, 20, 20, 30', () => {
    expect(
      Object.values(OFFER_OPTIONS).map((o) => o.tiles),
    ).toEqual([10, 20, 20, 20, 20, 30]);
  });
});

describe('drawChoices', () => {
  it('never draws an option whose weight is zero', () => {
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

  it('favours heavier options in proportion to their weights', () => {
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
    const kinds: OfferId[] = ['bridge', 'tunnel', 'motorway', 'lights'];
    expect(drawChoices(createRng(42), kinds)).toEqual(
      drawChoices(createRng(42), kinds),
    );
  });
});
