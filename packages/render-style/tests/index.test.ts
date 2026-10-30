import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME, TILE_SIZE } from '../src/index.ts';

describe('@overpass-game/render-style', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@overpass-game/render-style');
  });
});

describe('sizes', () => {
  it('uses a positive whole-pixel tile size', () => {
    expect(Number.isInteger(TILE_SIZE) && TILE_SIZE > 0).toBe(true);
  });
});
