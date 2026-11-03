import {
  bestKey,
  openCampaignMaps,
  tuning,
  type BestScores,
} from '@overpass-game/sim';
import type { CampaignMap } from '../game/campaign-maps.ts';

/**
 * The campaign rows the map select shows: which maps are open, the best trips on each, and for a
 * locked map, what it takes to open it. Pure, so the rules the menu shows are tested without a browser.
 */

export interface MenuRow {
  id: string;
  name: string;
  open: boolean;
  /** Best trips on this map in the campaign, or null before any run on it. */
  best: number | null;
  /** Why a locked map is locked. Null for an open map and for the first map. */
  hint: string | null;
  /** The week of this map's saved run, or null when there is no run to resume. */
  savedWeek: number | null;
}

export interface CampaignRowOptions {
  /** Opens every map, for checking the layout of the map select. Dev only, via DEV_FLAGS. */
  showAll?: boolean;
}

export function campaignRows(
  maps: readonly CampaignMap[],
  best: BestScores,
  savedWeeks: Readonly<Record<string, number>> = {},
  options: CampaignRowOptions = {},
): MenuRow[] {
  const open = new Set(
    openCampaignMaps(
      maps.map((m) => m.id),
      best,
    ),
  );
  return maps.map((m, i) => {
    const isOpen = options.showAll === true || open.has(m.id);
    const prev = i > 0 ? maps[i - 1] : undefined;
    const hint =
      !isOpen && prev
        ? `Reach ${tuning.CAMPAIGN_UNLOCK_TRIPS} trips on ${prev.name} to unlock`
        : null;
    return {
      id: m.id,
      name: m.name,
      open: isOpen,
      best: best[bestKey('campaign', m.id)] ?? null,
      hint,
      savedWeek: savedWeeks[m.id] ?? null,
    };
  });
}
