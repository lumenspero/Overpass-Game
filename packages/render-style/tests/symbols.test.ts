import { describe, expect, it } from 'vitest';
import {
  BUILDING_SYMBOLS,
  buildingSymbol,
  contrastRatio,
  symbolInk,
} from '../src/index.ts';

describe('buildingSymbol', () => {
  it('gives each palette index its own symbol, in order', () => {
    const picked = BUILDING_SYMBOLS.map((_, i) => buildingSymbol(i));
    expect(picked).toEqual([...BUILDING_SYMBOLS]);
    expect(new Set(picked).size).toBe(BUILDING_SYMBOLS.length);
  });

  it('repeats past the end of the list', () => {
    expect(buildingSymbol(BUILDING_SYMBOLS.length)).toBe(BUILDING_SYMBOLS[0]);
  });
});

describe('symbolInk', () => {
  it('picks black on light colours and white on dark ones', () => {
    expect(symbolInk(0xffffff)).toBe(0x000000);
    expect(symbolInk(0x000000)).toBe(0xffffff);
  });

  it('always gives the higher contrast of the two', () => {
    for (const c of [0x2a6fdb, 0xf2c46d, 0x7d3c98, 0x3b8e4f]) {
      const ink = symbolInk(c);
      const other = ink === 0x000000 ? 0xffffff : 0x000000;
      expect(contrastRatio(c, ink)).toBeGreaterThanOrEqual(
        contrastRatio(c, other),
      );
    }
  });
});
