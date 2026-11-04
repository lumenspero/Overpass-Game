import type { MusicStem } from './catalog.ts';
import { WEEK_HOURS } from './week-tick.ts';

/** The volume of each stem, from 0 (silent) to 1 (full). */
export type StemLevels = Record<MusicStem, number>;

/** Every stem at full volume. This is how the menu plays: the whole track, as one mix. */
export const FULL_STEMS: StemLevels = { pad: 1, melody: 1, percussion: 1 };

/** Cars on the map at which the melody stem reaches full volume. */
export const CARS_FOR_FULL_MELODY = 30;

/** Pins waiting across all destinations at which the percussion stem reaches full volume. */
export const PINS_FOR_FULL_PERCUSSION = 6;

/** The pad never drops below this, so the music is always there under the game. */
export const PAD_BASE = 0.6;

/** How long a stem takes to move to a new level, in seconds (the time constant of the fade). */
export const STEM_FADE_S = 1.5;

/** What the stems follow, read from the sim. */
export interface StemInputs {
  /** Cars on the road now. */
  cars: number;
  /** Pins waiting across every destination. */
  pins: number;
  /** True while any destination's overflow countdown is running. */
  overflowing: boolean;
  /** The hour of the week, 0 to 167 (see hourOfWeek). */
  weekHour: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The target volume of each stem for the game state. The pad rises through the week, so the music
 * thickens as Sunday comes round. The melody follows traffic, and the percussion follows pin
 * pressure: it is at full while an overflow is counting down.
 */
export function stemLevels(input: StemInputs): StemLevels {
  const weekProgress = clamp01(input.weekHour / WEEK_HOURS);
  return {
    pad: PAD_BASE + (1 - PAD_BASE) * weekProgress,
    melody: clamp01(input.cars / CARS_FOR_FULL_MELODY),
    percussion: input.overflowing
      ? 1
      : clamp01(input.pins / PINS_FOR_FULL_PERCUSSION),
  };
}
