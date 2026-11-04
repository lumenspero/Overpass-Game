import type { SimState } from './sim.ts';
import { tuning, type TuningKey } from './config.ts';
import { nextFloat, type RngState } from './rng.ts';

/**
 * Upgrades and the weekly offer (spec: Upgrades). At the start of each week after the first,
 * the player is offered UPGRADE_CHOICE_COUNT different options, drawn by weight from the
 * options the map allows. Choosing an option puts its upgrades in stock and adds its road
 * tiles to the budget. The clock pauses while an offer waits (see step() in sim.ts).
 */

export const UPGRADE_KINDS = [
  'bridge',
  'tunnel',
  'motorway',
  'roundabout',
  'light',
] as const;

export type UpgradeKind = (typeof UPGRADE_KINDS)[number];

/** How many of each upgrade the player holds, ready to place. */
export type Stock = Record<UpgradeKind, number>;

export function emptyStock(): Stock {
  return {
    bridge: 0,
    tunnel: 0,
    motorway: 0,
    roundabout: 0,
    light: 0,
  };
}

/** The six options an offer can show. */
export const OFFER_IDS = [
  'motorway',
  'bridge',
  'roundabout',
  'tunnel',
  'lights',
  'tiles',
] as const;

export type OfferId = (typeof OFFER_IDS)[number];

export interface OfferOption {
  /** Upgrades added to stock when the option is chosen. */
  upgrades: Partial<Record<UpgradeKind, number>>;
  /** Road tiles added to the budget when the option is chosen. */
  tiles: number;
}

/** What each option gives (spec: Upgrades). */
export const OFFER_OPTIONS: Record<OfferId, OfferOption> = {
  motorway: { upgrades: { motorway: 1 }, tiles: 10 },
  bridge: { upgrades: { bridge: 1 }, tiles: 20 },
  roundabout: { upgrades: { roundabout: 1 }, tiles: 20 },
  tunnel: { upgrades: { tunnel: 1 }, tiles: 20 },
  lights: { upgrades: { light: 2 }, tiles: 20 },
  tiles: { upgrades: {}, tiles: 30 },
};

/** How many options each weekly offer gives the player to choose from. */
export const UPGRADE_CHOICE_COUNT = 2;

const WEIGHT_KEY: Record<OfferId, TuningKey> = {
  motorway: 'UPGRADE_WEIGHT_MOTORWAY',
  bridge: 'UPGRADE_WEIGHT_BRIDGE',
  roundabout: 'UPGRADE_WEIGHT_ROUNDABOUT',
  tunnel: 'UPGRADE_WEIGHT_TUNNEL',
  lights: 'UPGRADE_WEIGHT_LIGHT',
  tiles: 'UPGRADE_WEIGHT_TILES',
};

/** The live weight of an option. Zero means it is never offered. */
export function offerWeight(id: OfferId): number {
  return tuning[WEIGHT_KEY[id]];
}

/**
 * Draws up to `count` different options from `candidates`, each chosen with probability
 * proportional to its weight. Options with zero weight are never drawn. Returns fewer than
 * `count` only when the candidates run out. Consumes no randomness when nothing can be drawn.
 */
export function drawChoices(
  rng: RngState,
  candidates: readonly OfferId[],
  count: number = UPGRADE_CHOICE_COUNT,
): OfferId[] {
  const pool = candidates.filter((k) => offerWeight(k) > 0);
  const picks: OfferId[] = [];
  while (picks.length < count && pool.length > 0) {
    const total = pool.reduce((sum, k) => sum + offerWeight(k), 0);
    let roll = nextFloat(rng) * total;
    let index = 0;
    for (; index < pool.length - 1; index++) {
      roll -= offerWeight(pool[index]);
      if (roll < 0) break;
    }
    picks.push(pool[index]);
    pool.splice(index, 1);
  }
  return picks;
}

export type ChooseResult =
  { ok: true } | { ok: false; reason: 'no-offer' | 'not-offered' };

/**
 * Answers the oldest offer: the chosen option's upgrades go into stock, its tiles go into the
 * budget, and the offer is closed. An offer that does not include the option is left open.
 */
export function chooseOffer(state: SimState, id: OfferId): ChooseResult {
  const offer = state.offers[0];
  if (!offer) return { ok: false, reason: 'no-offer' };
  if (!offer.includes(id)) return { ok: false, reason: 'not-offered' };
  const option = OFFER_OPTIONS[id];
  state.offers.shift();
  for (const kind of UPGRADE_KINDS) {
    state.stock[kind] += option.upgrades[kind] ?? 0;
  }
  state.budget += option.tiles;
  return { ok: true };
}

/**
 * Queues this week's offer. Called once at each week boundary. Nothing is given once the game
 * has ended. Tiles are always on offer, so a map that restricts its options can't leave the
 * player with no choice.
 */
export function grantWeeklyReward(
  state: SimState,
  candidates: readonly OfferId[] = OFFER_IDS,
): void {
  if (state.over) return;
  const pool = candidates.includes('tiles')
    ? candidates
    : [...candidates, 'tiles' as const];
  const choices = drawChoices(state.rng, pool);
  if (choices.length === UPGRADE_CHOICE_COUNT) state.offers.push(choices);
}
