import { describe, expect, it } from 'vitest';
import { createRng, nextFloat } from '../src/index.ts';

describe('seeded rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 100 }, () => nextFloat(a));
    const seqB = Array.from({ length: 100 }, () => nextFloat(b));
    expect(seqA).toEqual(seqB);
  });

  it('stays in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = nextFloat(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('resumes exactly from a serialized state', () => {
    const rng = createRng(99);
    for (let i = 0; i < 10; i++) nextFloat(rng);
    const saved = JSON.parse(JSON.stringify(rng)) as typeof rng;
    const next = nextFloat(rng);
    expect(nextFloat(saved)).toBe(next);
  });
});
