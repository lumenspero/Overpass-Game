import type { SimState } from './sim.ts';
import { OFFER_IDS, type OfferId } from './upgrades.ts';

/**
 * Per-map rules (spec: Destination growth and rule hooks). A map passes its rules to
 * the sim as data, so it can change without code changes. `allowedOffers` leaves out offer options
 * the map does not want. Colours are not a map rule: they arrive with businesses (spec: Business
 * arrival and house supply).
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
  | { kind: 'allowedOffers'; options: RestrictableOffer[] }
  // Sim only, not in the map format: no businesses arrive and no houses are topped up. For scripted
  // demos, which bring their own buildings.
  | { kind: 'noSpawns' };

/** Whether the run's rules turn off business arrivals and house top-ups. */
export function spawnsOff(state: SimState): boolean {
  return state.rules.some((r) => r.kind === 'noSpawns');
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
