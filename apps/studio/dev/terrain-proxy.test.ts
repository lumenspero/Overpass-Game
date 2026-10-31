import { describe, expect, it } from 'vitest';
import { checkTerrainRequest, parseTileUrl } from './terrain-proxy.ts';

describe('parseTileUrl', () => {
  it('reads a Terrarium tile path', () => {
    expect(parseTileUrl('/terrarium/10/238/401.png')).toEqual({
      z: 10,
      x: 238,
      y: 401,
    });
  });

  it('refuses other paths and missing paths', () => {
    expect(parseTileUrl('/terrarium/10/238/401.jpg')).toBeNull();
    expect(parseTileUrl('/other/10/1/1.png')).toBeNull();
    expect(parseTileUrl(undefined)).toBeNull();
  });

  it('refuses zoom levels above the published range', () => {
    expect(parseTileUrl('/terrarium/16/0/0.png')).toBeNull();
  });

  it('refuses tiles outside the world at that zoom', () => {
    expect(parseTileUrl('/terrarium/1/2/0.png')).toBeNull();
  });
});

describe('checkTerrainRequest', () => {
  it('allows a GET for a tile', () => {
    expect(checkTerrainRequest('GET', '/terrarium/10/238/401.png')).toBeNull();
  });

  it('refuses other methods', () => {
    expect(
      checkTerrainRequest('POST', '/terrarium/10/238/401.png')?.status,
    ).toBe(405);
  });

  it('refuses other paths', () => {
    expect(checkTerrainRequest('GET', '/secret')?.status).toBe(404);
  });
});
