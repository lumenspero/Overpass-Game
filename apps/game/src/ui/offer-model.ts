import {
  OFFER_OPTIONS,
  UPGRADE_KINDS,
  type OfferId,
  type OfferOption,
} from '@overpass-game/sim';

/**
 * Text and counts for the weekly offer popup (spec: Upgrades). Pure, so it can be tested
 * without the DOM.
 */

/** The week just completed: the offer appears when week N ends, so tick N × weekTicks. */
export function weekNumber(tick: number, weekTicks: number): number {
  return Math.max(1, Math.floor(tick / weekTicks));
}

/** How many upgrade items an option gives in total (two traffic lights gives 2). */
export function upgradeCount(option: OfferOption): number {
  return UPGRADE_KINDS.reduce(
    (sum, kind) => sum + (option.upgrades[kind] ?? 0),
    0,
  );
}

/** The option's heading: "2 Traffic lights" when it gives more than one upgrade. */
export function choiceName(id: OfferId, label: string): string {
  const count = upgradeCount(OFFER_OPTIONS[id]);
  return id !== 'tiles' && count > 1 ? `${count} ${label}` : label;
}

export function tilesText(tiles: number): string {
  return `${tiles} road tiles`;
}

/** A line for the offers queued behind the one shown, or empty when there are none. */
export function waitingText(pending: number): string {
  return pending > 1 ? `${pending} offers waiting` : '';
}
