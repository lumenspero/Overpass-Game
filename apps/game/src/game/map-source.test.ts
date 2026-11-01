import { describe, expect, it } from 'vitest';
import testMapJson from '../../../../maps/test.map.json';
import { loadPlayableMap, mapIdFromSearch } from './map-source.ts';

describe('mapIdFromSearch', () => {
  it('reads a valid map id', () => {
    expect(mapIdFromSearch('?map=tulsa-2')).toBe('tulsa-2');
  });

  it('reads nothing for a missing, empty, invalid or test id', () => {
    for (const s of [
      '',
      '?x=1',
      '?map=',
      '?map=../etc',
      '?map=Tulsa',
      '?map=test',
    ]) {
      expect(mapIdFromSearch(s)).toBeNull();
    }
  });
});

describe('loadPlayableMap', () => {
  it('fetches and parses a compiled map from maps/', async () => {
    const seen: string[] = [];
    const fake = (async (url: string) => {
      seen.push(url);
      return new Response(JSON.stringify(testMapJson));
    }) as typeof fetch;
    const map = await loadPlayableMap('tulsa', fake);
    expect(seen).toEqual(['maps/tulsa.map.json']);
    expect(map.cols).toBe(testMapJson.cols);
  });

  it('throws a readable error for a missing map', async () => {
    const fake = (async () =>
      new Response('nope', { status: 404 })) as typeof fetch;
    await expect(loadPlayableMap('nope', fake)).rejects.toThrow(
      'No map "nope"',
    );
  });
});
