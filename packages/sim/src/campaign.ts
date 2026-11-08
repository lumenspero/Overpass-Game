import { tuning } from './config.ts';

/**
 * Campaign unlocks and best scores (spec: Campaign unlocks). Nothing is stored here: the game
 * passes the campaign order and the best scores it holds, and gets back what is open. A map's
 * state is derived from the best scores, so M11 only has to save the scores.
 */

/** The two ways to play a map. Their best scores are kept apart, so a challenge never opens the campaign. */
export type PlayMode = 'campaign' | 'challenge';

/** Best trips per play, keyed by `bestKey`. A key is absent until a run on that play has ended. */
export type BestScores = Readonly<Record<string, number>>;

export function bestKey(mode: PlayMode, mapId: string): string {
  return `${mode}/${mapId}`;
}

/**
 * Records a finished run's trips. Keeps the higher of the old best and the new trips, and
 * returns a new object; the input is never changed.
 */
export function recordRun(
  best: BestScores,
  mode: PlayMode,
  mapId: string,
  trips: number,
): BestScores {
  const key = bestKey(mode, mapId);
  const old = best[key];
  if (old !== undefined && old >= trips) return { ...best };
  return { ...best, [key]: trips };
}

/** Whether a run with this many trips unlocks the map after it. */
export function unlocksNext(trips: number): boolean {
  return trips >= tuning.CAMPAIGN_UNLOCK_TRIPS;
}

/** How one campaign map opens. Absent fields take the defaults. */
export interface MapGate {
  /**
   * Trips a run on this map needs to unlock the map after it. Defaults to CAMPAIGN_UNLOCK_TRIPS.
   * A map's own threshold gates the next map, not itself.
   */
  unlockTrips?: number;
  /** Open from the start, whatever comes before it. The first map is always open, too. */
  openByDefault?: boolean;
}

/**
 * The campaign maps the player can play, in order. A map is open when it is open by default, or
 * when the map before it is open and has a best run with at least that map's `unlockTrips`.
 * Maps unlock one after another, so a map is never open past a locked one unless it is open by
 * default.
 */
export function openCampaignMaps(
  order: readonly string[],
  best: BestScores,
  gates: Readonly<Record<string, MapGate>> = {},
): string[] {
  if (new Set(order).size !== order.length) {
    throw new Error('campaign order lists a map more than once');
  }
  const open: string[] = [];
  const isOpen = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const gate = gates[id] ?? {};
    let opens = i === 0 || gate.openByDefault === true;
    if (!opens && i > 0 && isOpen.has(order[i - 1])) {
      const prevId = order[i - 1];
      const need = gates[prevId]?.unlockTrips ?? tuning.CAMPAIGN_UNLOCK_TRIPS;
      const prev = best[bestKey('campaign', prevId)];
      opens = prev !== undefined && prev >= need;
    }
    if (opens) {
      open.push(id);
      isOpen.add(id);
    }
  }
  return open;
}

/** The campaign map after this one, or null for the last map or a map not in the order. */
export function nextCampaignMap(
  order: readonly string[],
  mapId: string,
): string | null {
  const i = order.indexOf(mapId);
  if (i < 0 || i === order.length - 1) return null;
  return order[i + 1];
}
