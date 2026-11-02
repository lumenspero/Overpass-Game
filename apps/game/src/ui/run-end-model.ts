import {
  bestKey,
  nextCampaignMap,
  openCampaignMaps,
  tuning,
  type BestScores,
} from '@overpass-game/sim';
import type { CampaignMap } from '../game/campaign-maps.ts';

/**
 * What the end-of-run screen says about the map just played: its best, and whether the next map
 * is open or what would open it. Pure, so the wording and the rules are tested without a browser.
 */

export interface RunEndNext {
  id: string;
  name: string;
  open: boolean;
  /** What opens the next map, for a locked one. Null once it is open. */
  hint: string | null;
}

export interface RunEndModel {
  /** The map's best after this run, or null for a demo or the test map. */
  best: number | null;
  /** Whether this run is a new best (its first run counts). */
  newBest: boolean;
  /** The map after this one, or null for the last map or a map with no record. */
  next: RunEndNext | null;
}

export interface RunEndInput {
  /** The campaign map just played, or null for a demo or the test map. */
  mapId: string | null;
  trips: number;
  /** The map's best before this run, or null if it had none. */
  previousBest: number | null;
  /** The best scores after this run was recorded. */
  best: BestScores;
  maps: readonly CampaignMap[];
}

export function runEndModel(input: RunEndInput): RunEndModel {
  const { mapId, trips, previousBest, best, maps } = input;
  if (mapId === null) return { best: null, newBest: false, next: null };

  const bestNow = best[bestKey('campaign', mapId)] ?? trips;
  const newBest = previousBest === null || trips > previousBest;
  const order = maps.map((m) => m.id);
  const nextId = nextCampaignMap(order, mapId);
  if (nextId === null) return { best: bestNow, newBest, next: null };

  const name = maps.find((m) => m.id === nextId)?.name ?? nextId;
  const open = openCampaignMaps(order, best).includes(nextId);
  const hint = open
    ? null
    : `Reach ${tuning.CAMPAIGN_UNLOCK_TRIPS} trips here to unlock ${name}`;
  return { best: bestNow, newBest, next: { id: nextId, name, open, hint } };
}
