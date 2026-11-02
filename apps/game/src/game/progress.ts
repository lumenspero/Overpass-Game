import { recordRun, type BestScores, type PlayMode } from '@overpass-game/sim';

/**
 * Best scores for this page load. They are held in memory until M11 saves them. The campaign's
 * open and locked maps are derived from them, so nothing else is kept.
 */
let best: BestScores = {};

/** The best scores so far, read by the menu and the end screen. */
export function currentBest(): BestScores {
  return best;
}

/** Records a finished run's trips for its map. The best is kept only if the run beat it. */
export function recordFinishedRun(
  mode: PlayMode,
  mapId: string,
  trips: number,
): void {
  best = recordRun(best, mode, mapId, trips);
}
