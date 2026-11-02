import type { BestScores } from '@overpass-game/sim';

/**
 * Best scores for this page load. They are held in memory until M11 saves them. The campaign's
 * open and locked maps are derived from them, so nothing else is kept.
 */
const best: Record<string, number> = {};

/** The best scores so far, read by the menu. The sim's campaign rules take them as data. */
export function currentBest(): BestScores {
  return best;
}
