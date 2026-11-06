/**
 * Seeded generator (mulberry32). The whole state is one integer, so it
 * serializes as plain data and a saved run resumes with the same sequence.
 */
export interface RngState {
  state: number;
  /** The seed the generator started from. It never changes, so per-week rolls can be made from it without
   * drawing from the sequence. Absent in runs saved before it was kept, which read it as 0. */
  seed?: number;
}

export function createRng(seed: number): RngState {
  return { state: seed >>> 0, seed: seed >>> 0 };
}

/** Returns a float in [0, 1) and advances the generator. */
export function nextFloat(rng: RngState): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
