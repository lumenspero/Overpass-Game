import { openCampaignMaps, tuning, type BestScores } from '@overpass-game/sim';
import type { CampaignMap } from '../game/campaign-maps.ts';

/**
 * The campaign rows the map select shows: which maps are open, and for a locked map, what it
 * takes to open it. Pure, so the rules the menu shows are tested without a browser.
 */

export interface MenuRow {
  id: string;
  name: string;
  open: boolean;
  /** Why a locked map is locked. Null for an open map and for the first map. */
  hint: string | null;
}

export function campaignRows(
  maps: readonly CampaignMap[],
  best: BestScores,
): MenuRow[] {
  const open = new Set(
    openCampaignMaps(
      maps.map((m) => m.id),
      best,
    ),
  );
  return maps.map((m, i) => {
    const isOpen = open.has(m.id);
    const prev = i > 0 ? maps[i - 1] : undefined;
    const hint =
      !isOpen && prev
        ? `Reach ${tuning.CAMPAIGN_UNLOCK_TRIPS} trips on ${prev.name} to unlock`
        : null;
    return { id: m.id, name: m.name, open: isOpen, hint };
  });
}
