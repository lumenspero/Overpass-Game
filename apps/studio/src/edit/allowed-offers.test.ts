import { RESTRICTABLE_OFFERS, type SourceMap } from '@overpass-game/map-schema';
import { describe, expect, it } from 'vitest';
import { allowedOffersOf, setAllowedOffers } from './ops.ts';

const blank = (): SourceMap => ({ rules: [] }) as unknown as SourceMap;

describe('allowed offers on a Studio map', () => {
  it('allows every option until the author restricts them', () => {
    expect(allowedOffersOf(blank())).toEqual([...RESTRICTABLE_OFFERS]);
  });

  it('stores a rule for a restricted set and reads it back', () => {
    const map = setAllowedOffers(blank(), ['bridge', 'tunnel']);
    expect(map.rules).toEqual([
      { kind: 'allowedOffers', options: ['bridge', 'tunnel'] },
    ]);
    expect(allowedOffersOf(map)).toEqual(['bridge', 'tunnel']);
  });

  it('stores no rule when every option is allowed again', () => {
    const restricted = setAllowedOffers(blank(), ['bridge']);
    const map = setAllowedOffers(restricted, [...RESTRICTABLE_OFFERS]);
    expect(map.rules).toEqual([]);
  });

  it('will not leave the map with no options at all', () => {
    const map = blank();
    expect(setAllowedOffers(map, [])).toBe(map);
  });
});
