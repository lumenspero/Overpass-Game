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

/**
 * The campaign maps the player can play, in order. The first map is always open. Each later
 * map opens once the map before it has a best run that unlocks it. The list stops at the
 * first locked map, so a map later in the order never opens past a locked one.
 */
export function openCampaignMaps(
  order: readonly string[],
  best: BestScores,
): string[] {
  if (new Set(order).size !== order.length) {
    throw new Error('campaign order lists a map more than once');
  }
  const open: string[] = [];
  for (let i = 0; i < order.length; i++) {
    if (i > 0) {
      const prev = best[bestKey('campaign', order[i - 1])];
      if (prev === undefined || !unlocksNext(prev)) break;
    }
    open.push(order[i]);
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
