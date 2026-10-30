import type { SimState, UpgradeKind } from '@overpass-game/sim';

/**
 * What the offer panel shows (spec: Upgrades). The oldest offer is shown first. Nothing is
 * shown once the game is over, since no further choice can change it.
 */

export const UPGRADE_LABELS: Record<UpgradeKind, string> = {
  bridge: 'Bridge',
  tunnel: 'Tunnel',
  motorway: 'Motorway',
  roundabout: 'Roundabout',
  light: 'Traffic light',
};

export interface OfferView {
  /** Offers waiting, including the one shown. */
  pending: number;
  choices: Array<{ kind: UpgradeKind; label: string }>;
}

export function offerView(sim: SimState): OfferView | null {
  const offer = sim.offers[0];
  if (!offer || sim.over) return null;
  return {
    pending: sim.offers.length,
    choices: offer.map((kind) => ({ kind, label: UPGRADE_LABELS[kind] })),
  };
}
