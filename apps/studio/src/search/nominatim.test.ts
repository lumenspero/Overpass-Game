import { describe, expect, it } from 'vitest';
import { parseNominatimResults } from './nominatim.ts';

describe('parseNominatimResults', () => {
  it('reads a jsonv2 result, turning the bounding box into west-south-east-north', () => {
    const [place] = parseNominatimResults([
      {
        osm_type: 'relation',
        osm_id: 123,
        lat: '36.1539816',
        lon: '-95.992775',
        display_name: 'Tulsa, Oklahoma, United States',
        boundingbox: ['36.0', '36.3', '-96.1', '-95.8'],
      },
    ]);
    expect(place).toEqual({
      id: 'relation/123',
      name: 'Tulsa, Oklahoma, United States',
      centre: [-95.992775, 36.1539816],
      bbox: [-96.1, 36.0, -95.8, 36.3],
    });
  });

  it('skips entries without a usable point and keeps the rest', () => {
    const places = parseNominatimResults([
      { lat: 'nope', lon: '1' },
      null,
      {
        osm_type: 'node',
        osm_id: 9,
        lat: '40',
        lon: '-90',
        display_name: 'Somewhere',
      },
    ]);
    expect(places).toHaveLength(1);
    expect(places[0]?.id).toBe('node/9');
    expect(places[0]?.bbox).toBeNull();
  });

  it('returns nothing for a body that is not a list', () => {
    expect(parseNominatimResults({ error: 'nope' })).toEqual([]);
    expect(parseNominatimResults(null)).toEqual([]);
  });

  it('ignores a bounding box with the wrong shape', () => {
    const [place] = parseNominatimResults([
      {
        osm_type: 'node',
        osm_id: 1,
        lat: '1',
        lon: '1',
        boundingbox: ['1', '2'],
      },
    ]);
    expect(place?.bbox).toBeNull();
  });
});
