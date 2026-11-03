/** The highest volume level. Levels run from 0 (silent) to this value. */
export const MAX_LEVEL = 10;

/**
 * Gain for a volume level: silent at 0, full at the top level, and each step down is 2 dB quieter.
 * Levels outside the range are clamped.
 */
export function volumeToGain(level: number): number {
  const clamped = Math.min(MAX_LEVEL, Math.max(0, level));
  if (clamped === 0) return 0;
  return 10 ** (((clamped - MAX_LEVEL) * 2) / 20);
}
