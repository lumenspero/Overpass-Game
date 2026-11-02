import { afterEach, describe, expect, it } from 'vitest';
import {
  bestKey,
  recordRun,
  resetTuning,
  tuning,
  type BestScores,
} from '@overpass-game/sim';
import { campaignRows } from './menu-model.ts';

afterEach(() => resetTuning());

const MAPS = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
];

describe('campaignRows', () => {
  it('opens only the first map before any run', () => {
    const rows = campaignRows(MAPS, {});
    expect(rows.map((r) => r.open)).toEqual([true, false, false]);
    expect(rows[0].hint).toBeNull();
  });

  it('says what unlocks a locked map, using the live threshold', () => {
    tuning.CAMPAIGN_UNLOCK_TRIPS = 7;
    const rows = campaignRows(MAPS, {});
    expect(rows[1].hint).toBe('Reach 7 trips on Alpha to unlock');
    expect(rows[2].hint).toBe('Reach 7 trips on Beta to unlock');
  });

  it('opens the next map once the threshold is reached', () => {
    const t = tuning.CAMPAIGN_UNLOCK_TRIPS;
    const best: BestScores = recordRun({}, 'campaign', 'a', t);
    const rows = campaignRows(MAPS, best);
    expect(rows.map((r) => r.open)).toEqual([true, true, false]);
    expect(rows[1].hint).toBeNull();
    expect(rows[2].hint).not.toBeNull();
  });

  it('ignores challenge bests when opening the campaign', () => {
    const best = recordRun({}, 'challenge', 'a', 999);
    expect(campaignRows(MAPS, best).map((r) => r.open)).toEqual([
      true,
      false,
      false,
    ]);
    expect(best[bestKey('campaign', 'a')]).toBeUndefined();
  });
});

describe('campaignRows best scores', () => {
  it('shows the campaign best on each map, and null before a run', () => {
    const best: BestScores = { 'campaign/a': 17 };
    const rows = campaignRows(MAPS, best);
    expect(rows.map((r) => r.best)).toEqual([17, null, null]);
  });
});

describe('campaignRows saved runs', () => {
  it('shows the week of a saved run on its map, and nothing elsewhere', () => {
    const rows = campaignRows(MAPS, {}, { a: 4 });
    expect(rows.map((r) => r.savedWeek)).toEqual([4, null, null]);
  });
});
