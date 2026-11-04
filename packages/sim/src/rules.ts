import { weekOf } from './score.ts';
import type { SimState } from './sim.ts';
import { OFFER_IDS, type OfferId } from './upgrades.ts';

/**
 * Per-map rules (spec: Destination growth and rule hooks). A map passes its rules to
 * the sim as data, so it can change without code changes. The first kind unlocks a building
 * colour from a week on: until then, no house or destination may use that colour. The second
 * leaves out offer options the map does not want.
 */

/** The offer options a map can leave out. Road tiles are always on offer, so they are not listed. */
export const RESTRICTABLE_OFFERS = [
  'motorway',
  'bridge',
  'roundabout',
  'tunnel',
  'lights',
] as const;

export type RestrictableOffer = (typeof RESTRICTABLE_OFFERS)[number];

export type MapRule =
  | { kind: 'unlockColour'; colour: number; week: number }
  | { kind: 'allowedOffers'; options: RestrictableOffer[] };

/** Whether a building colour may be used at the state's current tick. */
export function colourUnlocked(state: SimState, colour: number): boolean {
  const week = weekOf(state.tick);
  return state.rules.every(
    (r) => r.kind !== 'unlockColour' || r.colour !== colour || week >= r.week,
  );
}

/**
 * The offers a week may draw from: the map's allowed options, with road tiles always included.
 * A map with no such rule, or with an empty list, allows every offer.
 */
export function offerCandidates(state: SimState): OfferId[] {
  const rule = state.rules.find((r) => r.kind === 'allowedOffers');
  if (!rule || rule.kind !== 'allowedOffers' || rule.options.length === 0) {
    return [...OFFER_IDS];
  }
  const allowed: readonly string[] = rule.options;
  return OFFER_IDS.filter((id) => id === 'tiles' || allowed.includes(id));
}
