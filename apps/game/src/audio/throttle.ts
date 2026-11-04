import type { SoundEvent } from './catalog.ts';

/**
 * The shortest gap, in seconds, between two plays of a frequent sound. Pins, arrivals and
 * countdown pulses can fire many times in one frame, especially at fast-forward; within the gap
 * the extra plays are dropped. Sounds not listed always play.
 */
export const MIN_GAP_S: Partial<Record<SoundEvent, number>> = {
  'pin.appeared': 0.09,
  'car.arrived': 0.07,
  'overflow.countdown': 0.25,
  'building.spawn': 0.15,
  'road.place': 0.04,
  'road.erase': 0.04,
  'place.refused': 0.3,
};

/** Whether a sound may play at `now`, given when it last played and its minimum gap. */
export function allowPlay(
  last: number | undefined,
  now: number,
  gap: number | undefined,
): boolean {
  if (gap === undefined || last === undefined) return true;
  return now - last >= gap;
}
