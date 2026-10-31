import { describe, expect, it } from 'vitest';
import { lonLatToMercator, mercatorToLonLat } from './mercator.ts';

describe('Web Mercator conversion', () => {
  it('maps the origin to zero', () => {
    const [x, y] = lonLatToMercator([0, 0]);
    expect(x).toBe(0);
    expect(y).toBeCloseTo(0, 6);
  });

  it('round-trips a city', () => {
    const tulsa: [number, number] = [-95.99, 36.15];
    const [lon, lat] = mercatorToLonLat(lonLatToMercator(tulsa));
    expect(lon).toBeCloseTo(tulsa[0], 9);
    expect(lat).toBeCloseTo(tulsa[1], 9);
  });

  it('clamps latitudes beyond the Mercator limit instead of returning infinity', () => {
    const [, y] = lonLatToMercator([0, 89.9]);
    expect(Number.isFinite(y)).toBe(true);
  });
});
