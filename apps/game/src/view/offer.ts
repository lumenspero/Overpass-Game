import {
  OFFER_OPTIONS,
  type OfferId,
  type OfferOption,
  type SimState,
} from '@overpass-game/sim';

/**
 * What the offer panel shows (spec: Upgrades). The oldest offer is shown first. Nothing is
 * shown once the game is over, since no further choice can change it.
 */

export const OFFER_LABELS: Record<OfferId, string> = {
  motorway: 'Motorway',
  bridge: 'Bridge',
  roundabout: 'Roundabout',
  tunnel: 'Tunnel',
  lights: 'Traffic lights',
  tiles: 'Road tiles',
};

export interface OfferView {
  /** Offers waiting, including the one shown. */
  pending: number;
  choices: Array<{ id: OfferId; label: string; option: OfferOption }>;
}

export function offerView(sim: SimState): OfferView | null {
  const offer = sim.offers[0];
  if (!offer || sim.over) return null;
  return {
    pending: sim.offers.length,
    choices: offer.map((id) => ({
      id,
      label: OFFER_LABELS[id],
      option: OFFER_OPTIONS[id],
    })),
  };
}
