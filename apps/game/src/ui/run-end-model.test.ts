import { afterEach, describe, expect, it } from 'vitest';
import { resetTuning, tuning, type BestScores } from '@overpass-game/sim';
import { runEndModel } from './run-end-model.ts';

afterEach(() => resetTuning());

const MAPS = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];

describe('runEndModel', () => {
  it('has no best or next map for a demo or the test map', () => {
    const m = runEndModel({
      mapId: null,
      trips: 9,
      previousBest: null,
      best: {},
      maps: MAPS,
    });
    expect(m).toEqual({ best: null, newBest: false, next: null });
  });

  it('counts the first run as a new best', () => {
    const best: BestScores = { 'campaign/a': 4 };
    const m = runEndModel({
      mapId: 'a',
      trips: 4,
      previousBest: null,
      best,
      maps: MAPS,
    });
    expect(m.best).toBe(4);
    expect(m.newBest).toBe(true);
  });

  it('keeps the old best when a run does not beat it', () => {
    const best: BestScores = { 'campaign/a': 12 };
    const m = runEndModel({
      mapId: 'a',
      trips: 7,
      previousBest: 12,
      best,
      maps: MAPS,
    });
    expect(m.best).toBe(12);
    expect(m.newBest).toBe(false);
  });

  it('marks a run that beats the old best', () => {
    const best: BestScores = { 'campaign/a': 30 };
    const m = runEndModel({
      mapId: 'a',
      trips: 30,
      previousBest: 12,
      best,
      maps: MAPS,
    });
    expect(m.newBest).toBe(true);
  });

  it('says what would open a locked next map, with the live threshold', () => {
    tuning.CAMPAIGN_UNLOCK_TRIPS = 15;
    const best: BestScores = { 'campaign/a': 9 };
    const m = runEndModel({
      mapId: 'a',
      trips: 9,
      previousBest: null,
      best,
      maps: MAPS,
    });
    expect(m.next).toEqual({
      id: 'b',
      name: 'Beta',
      open: false,
      hint: 'Unlock after 15 trips in Alpha',
      unlockedNow: false,
    });
  });

  it('shows the next map open once this run reaches the threshold', () => {
    const best: BestScores = { 'campaign/a': tuning.CAMPAIGN_UNLOCK_TRIPS };
    const m = runEndModel({
      mapId: 'a',
      trips: tuning.CAMPAIGN_UNLOCK_TRIPS,
      previousBest: null,
      best,
      maps: MAPS,
    });
    expect(m.next?.open).toBe(true);
    expect(m.next?.hint).toBeNull();
  });

  it('has no next map after the last one', () => {
    const best: BestScores = { 'campaign/b': 50 };
    const m = runEndModel({
      mapId: 'b',
      trips: 50,
      previousBest: null,
      best,
      maps: MAPS,
    });
    expect(m.next).toBeNull();
    expect(m.best).toBe(50);
  });

  it('marks the next map as unlocked by this run only when this run opened it', () => {
    tuning.CAMPAIGN_UNLOCK_TRIPS = 15;
    const now = runEndModel({
      mapId: 'a',
      trips: 20,
      previousBest: 9,
      best: { 'campaign/a': 20 },
      maps: MAPS,
    });
    expect(now.next?.open).toBe(true);
    expect(now.next?.unlockedNow).toBe(true);
    const already = runEndModel({
      mapId: 'a',
      trips: 25,
      previousBest: 20,
      best: { 'campaign/a': 25 },
      maps: MAPS,
    });
    expect(already.next?.open).toBe(true);
    expect(already.next?.unlockedNow).toBe(false);
  });
});
