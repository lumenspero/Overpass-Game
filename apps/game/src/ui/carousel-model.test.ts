import { describe, expect, it } from 'vitest';
import { clampIndex, startIndex, stepIndex } from './carousel-model.ts';

describe('clampIndex', () => {
  it('keeps an index inside the row', () => {
    expect(clampIndex(-3, 4)).toBe(0);
    expect(clampIndex(2, 4)).toBe(2);
    expect(clampIndex(9, 4)).toBe(3);
  });

  it('returns 0 for an empty row', () => {
    expect(clampIndex(5, 0)).toBe(0);
  });

  it('truncates a fractional index', () => {
    expect(clampIndex(1.9, 4)).toBe(1);
  });
});

describe('stepIndex', () => {
  it('moves one card at a time and stops at each end', () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(0, -1, 3)).toBe(0);
  });
});

describe('startIndex', () => {
  it('starts on the first open map', () => {
    expect(startIndex([{ open: true }, { open: true }, { open: false }])).toBe(
      0,
    );
    expect(startIndex([{ open: false }, { open: true }])).toBe(1);
  });

  it('falls back to the first card when nothing is open', () => {
    expect(startIndex([{ open: false }, { open: false }])).toBe(0);
    expect(startIndex([])).toBe(0);
  });
});
