import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, volumeToGain } from './levels.ts';

describe('volumeToGain', () => {
  it('is silent at 0 and full at the top level', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(MAX_LEVEL)).toBe(1);
  });

  it('steps down 2 dB per level', () => {
    expect(20 * Math.log10(volumeToGain(9))).toBeCloseTo(-2, 5);
    expect(20 * Math.log10(volumeToGain(5))).toBeCloseTo(-10, 5);
  });

  it('clamps levels outside the range', () => {
    expect(volumeToGain(-3)).toBe(0);
    expect(volumeToGain(99)).toBe(1);
  });
});
