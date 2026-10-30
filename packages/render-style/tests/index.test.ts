import { describe, expect, it } from 'vitest';
import {
  PACKAGE_NAME,
  PALETTE,
  ROAD_WIDTH_TILES,
  TILE_SIZE,
} from '../src/index.ts';

describe('@overpass-game/render-style', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@overpass-game/render-style');
  });

  it('uses a positive whole-pixel tile size', () => {
    expect(Number.isInteger(TILE_SIZE) && TILE_SIZE > 0).toBe(true);
  });

  it('keeps road width strictly inside one tile', () => {
    expect(ROAD_WIDTH_TILES).toBeGreaterThan(0);
    expect(ROAD_WIDTH_TILES).toBeLessThan(1);
  });

  it('defines every palette colour as a 24-bit hex number', () => {
    for (const color of Object.values(PALETTE)) {
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    }
  });
});
