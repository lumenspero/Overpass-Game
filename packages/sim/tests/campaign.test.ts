import { afterEach, describe, expect, it } from 'vitest';
import {
  bestKey,
  nextCampaignMap,
  openCampaignMaps,
  recordRun,
  resetTuning,
  tuning,
  unlocksNext,
} from '../src/index.ts';

afterEach(() => resetTuning());

const ORDER = ['a', 'b', 'c'];

describe('unlocksNext', () => {
  it('unlocks at the threshold, not below it', () => {
    const t = tuning.CAMPAIGN_UNLOCK_TRIPS;
    expect(unlocksNext(t)).toBe(true);
    expect(unlocksNext(t - 1)).toBe(false);
  });

  it('reads the threshold live, so the debug panel can change it', () => {
    tuning.CAMPAIGN_UNLOCK_TRIPS = 5;
    expect(unlocksNext(5)).toBe(true);
    expect(unlocksNext(4)).toBe(false);
  });
});

describe('recordRun', () => {
  it('keeps the highest trips for a play', () => {
    let best = recordRun({}, 'campaign', 'a', 12);
    best = recordRun(best, 'campaign', 'a', 7);
    expect(best[bestKey('campaign', 'a')]).toBe(12);
    best = recordRun(best, 'campaign', 'a', 30);
    expect(best[bestKey('campaign', 'a')]).toBe(30);
  });

  it('does not change the object it was given', () => {
    const before = { [bestKey('campaign', 'a')]: 4 };
    const after = recordRun(before, 'campaign', 'a', 9);
    expect(before[bestKey('campaign', 'a')]).toBe(4);
    expect(after).not.toBe(before);
  });

  it('keeps campaign and challenge bests apart', () => {
    const best = recordRun({}, 'challenge', 'a', 50);
    expect(best[bestKey('campaign', 'a')]).toBeUndefined();
    expect(openCampaignMaps(ORDER, best)).toEqual(['a']);
  });
});

describe('openCampaignMaps', () => {
  it('opens only the first map with no runs', () => {
    expect(openCampaignMaps(ORDER, {})).toEqual(['a']);
  });

  it('opens the next map once the one before reaches the threshold', () => {
    const t = tuning.CAMPAIGN_UNLOCK_TRIPS;
    const best = recordRun({}, 'campaign', 'a', t);
    expect(openCampaignMaps(ORDER, best)).toEqual(['a', 'b']);
  });

  it('stays locked just below the threshold', () => {
    const t = tuning.CAMPAIGN_UNLOCK_TRIPS;
    const best = recordRun({}, 'campaign', 'a', t - 1);
    expect(openCampaignMaps(ORDER, best)).toEqual(['a']);
  });

  it('opens the whole path in order, one unlock at a time', () => {
    const t = tuning.CAMPAIGN_UNLOCK_TRIPS;
    let best = recordRun({}, 'campaign', 'a', t);
    best = recordRun(best, 'campaign', 'b', t);
    expect(openCampaignMaps(ORDER, best)).toEqual(['a', 'b', 'c']);
  });

  it('never opens a map past a locked one, even with a best score on it', () => {
    const t = tuning.CAMPAIGN_UNLOCK_TRIPS;
    // b has a strong run, but a is not unlocked, so b is still locked.
    let best = recordRun({}, 'campaign', 'b', t + 10);
    best = recordRun(best, 'campaign', 'c', t + 10);
    expect(openCampaignMaps(ORDER, best)).toEqual(['a']);
  });

  it('keeps a map open once unlocked, even after a worse run', () => {
    const t = tuning.CAMPAIGN_UNLOCK_TRIPS;
    let best = recordRun({}, 'campaign', 'a', t);
    best = recordRun(best, 'campaign', 'a', 0);
    expect(openCampaignMaps(ORDER, best)).toEqual(['a', 'b']);
  });

  it('rejects an order that lists a map twice', () => {
    expect(() => openCampaignMaps(['a', 'b', 'a'], {})).toThrow(
      /more than once/,
    );
  });

  it('returns an empty list for an empty order', () => {
    expect(openCampaignMaps([], {})).toEqual([]);
  });
});

describe('nextCampaignMap', () => {
  it('returns the map after the given one', () => {
    expect(nextCampaignMap(ORDER, 'a')).toBe('b');
    expect(nextCampaignMap(ORDER, 'b')).toBe('c');
  });

  it('returns null for the last map and for an unknown map', () => {
    expect(nextCampaignMap(ORDER, 'c')).toBeNull();
    expect(nextCampaignMap(ORDER, 'zzz')).toBeNull();
  });
});

describe('openCampaignMaps with daisy-chained gates', () => {
  const ORDER4 = ['a', 'b', 'c', 'd'];

  it('opens the maps marked open by default, and the next one only from the previous threshold', () => {
    const gates = {
      a: { openByDefault: true },
      b: { openByDefault: true },
      c: { openByDefault: true, unlockTrips: 12 },
    };
    expect(openCampaignMaps(ORDER4, {}, gates)).toEqual(['a', 'b', 'c']);
    expect(openCampaignMaps(ORDER4, { 'campaign/c': 11 }, gates)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(openCampaignMaps(ORDER4, { 'campaign/c': 12 }, gates)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('uses the shared threshold for a map with no unlockTrips of its own', () => {
    const best = recordRun({}, 'campaign', 'a', tuning.CAMPAIGN_UNLOCK_TRIPS);
    expect(openCampaignMaps(ORDER4, best, { c: { unlockTrips: 99 } })).toEqual([
      'a',
      'b',
    ]);
  });

  it('keeps every map after a locked one closed, even one with a best run already', () => {
    const best = { 'campaign/b': 999, 'campaign/c': 999 };
    expect(openCampaignMaps(ORDER4, best)).toEqual(['a']);
  });

  it('opens a map open by default even when an earlier map is locked', () => {
    const order = ['a', 'b', 'mine'];
    expect(
      openCampaignMaps(order, {}, { mine: { openByDefault: true } }),
    ).toEqual(['a', 'mine']);
  });
});
