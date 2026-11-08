import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MAPS, campaignGates } from './campaign-maps.ts';

const MAPS_DIR = fileURLToPath(new URL('../../../../maps/', import.meta.url));

describe('CAMPAIGN_MAPS', () => {
  it('lists each map once, with a compiled map file beside it', () => {
    const ids = CAMPAIGN_MAPS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(existsSync(`${MAPS_DIR}${id}.map.json`), id).toBe(true);
    }
  });

  it('opens the first three maps by default and no others', () => {
    const open = CAMPAIGN_MAPS.map((m) => m.openByDefault === true);
    expect(open.slice(0, 3)).toEqual([true, true, true]);
    expect(open.slice(3).some(Boolean)).toBe(false);
  });

  it('gives each map from the fourth on a threshold for unlocking the map after it, as a whole number', () => {
    // The fourth map's gate is the third map's unlockTrips, so every map up to the last-but-one
    // needs one. The last map unlocks nothing.
    for (let i = 2; i < CAMPAIGN_MAPS.length - 1; i++) {
      const m = CAMPAIGN_MAPS[i]!;
      expect(Number.isInteger(m.unlockTrips), m.id).toBe(true);
      expect(m.unlockTrips!).toBeGreaterThan(0);
    }
  });

  it('keeps maps opened by default together at the end of the list', () => {
    const firstOwn = CAMPAIGN_MAPS.findIndex(
      (m, i) => i >= 3 && m.openByDefault,
    );
    if (firstOwn >= 0) {
      expect(CAMPAIGN_MAPS.slice(firstOwn).every((m) => m.openByDefault)).toBe(
        true,
      );
    }
  });

  it('turns the list into gates keyed by id', () => {
    const gates = campaignGates(CAMPAIGN_MAPS);
    expect(Object.keys(gates)).toHaveLength(CAMPAIGN_MAPS.length);
    const third = CAMPAIGN_MAPS[2]!;
    expect(gates[third.id]?.unlockTrips).toBe(third.unlockTrips);
  });
});
