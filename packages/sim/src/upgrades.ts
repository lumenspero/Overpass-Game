import type { SimState } from './sim.ts';
import { tuning, type TuningKey } from './config.ts';
import { nextFloat, type RngState } from './rng.ts';

/**
 * Upgrades and the weekly reward (spec: Upgrades). At the start of each week after the
 * first, the road budget gains WEEKLY_ROAD_REWARD tiles and the player is offered
 * UPGRADE_CHOICE_COUNT different upgrades. Each offer is queued until it is answered.
 * Only implemented upgrades can be offered, so IMPLEMENTED_UPGRADES grows as each
 * upgrade in M5 lands.
 */

export const UPGRADE_KINDS = [
  'bridge',
  'tunnel',
  'motorway',
  'roundabout',
  'light',
] as const;

export type UpgradeKind = (typeof UPGRADE_KINDS)[number];

/** Upgrades the sim can apply, and so the only ones it offers. */
export const IMPLEMENTED_UPGRADES: readonly UpgradeKind[] = [
  'bridge',
  'tunnel',
  'motorway',
  'roundabout',
  'light',
];

/** How many of each upgrade the player holds, ready to place. */
export type Stock = Record<UpgradeKind, number>;

export function emptyStock(): Stock {
  return { bridge: 0, tunnel: 0, motorway: 0, roundabout: 0, light: 0 };
}

/** How many upgrades each weekly offer gives the player to choose from. */
export const UPGRADE_CHOICE_COUNT = 2;

const WEIGHT_KEY: Record<UpgradeKind, TuningKey> = {
  bridge: 'UPGRADE_WEIGHT_BRIDGE',
  tunnel: 'UPGRADE_WEIGHT_TUNNEL',
  motorway: 'UPGRADE_WEIGHT_MOTORWAY',
  roundabout: 'UPGRADE_WEIGHT_ROUNDABOUT',
  light: 'UPGRADE_WEIGHT_LIGHT',
};

/** The live weight of an upgrade kind. Zero means it is never offered. */
export function upgradeWeight(kind: UpgradeKind): number {
  return tuning[WEIGHT_KEY[kind]];
}

/**
 * Draws up to `count` different kinds from `candidates`, each chosen with probability
 * proportional to its weight. Kinds with zero weight are never drawn. Returns fewer than
 * `count` only when the candidates run out. Consumes no randomness when nothing can be drawn.
 */
export function drawChoices(
  rng: RngState,
  candidates: readonly UpgradeKind[],
  count: number = UPGRADE_CHOICE_COUNT,
): UpgradeKind[] {
  const pool = candidates.filter((k) => upgradeWeight(k) > 0);
  const picks: UpgradeKind[] = [];
  while (picks.length < count && pool.length > 0) {
    const total = pool.reduce((sum, k) => sum + upgradeWeight(k), 0);
    let roll = nextFloat(rng) * total;
    let index = 0;
    for (; index < pool.length - 1; index++) {
      roll -= upgradeWeight(pool[index]);
      if (roll < 0) break;
    }
    picks.push(pool[index]);
    pool.splice(index, 1);
  }
  return picks;
}

/**
 * Grants the week's road reward and queues an offer. Called once at each week boundary.
 * No reward is given once the game has ended.
 */
export type ChooseResult =
  { ok: true } | { ok: false; reason: 'no-offer' | 'not-offered' };

/**
 * Answers the oldest offer: the chosen kind goes into stock and the offer is closed.
 * An offer that does not include the kind is left open.
 */
export function chooseUpgrade(
  state: SimState,
  kind: UpgradeKind,
): ChooseResult {
  const offer = state.offers[0];
  if (!offer) return { ok: false, reason: 'no-offer' };
  if (!offer.includes(kind)) return { ok: false, reason: 'not-offered' };
  state.offers.shift();
  state.stock[kind] += 1;
  return { ok: true };
}

export function grantWeeklyReward(
  state: SimState,
  candidates: readonly UpgradeKind[] = IMPLEMENTED_UPGRADES,
): void {
  if (state.over) return;
  state.budget += tuning.WEEKLY_ROAD_REWARD;
  const choices = drawChoices(state.rng, candidates);
  if (choices.length === UPGRADE_CHOICE_COUNT) state.offers.push(choices);
}
