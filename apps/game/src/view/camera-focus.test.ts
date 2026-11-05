import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '@overpass-game/render-style';
import { createFocusedCamera, resizeCamera, worldSize } from './camera.ts';

const world = worldSize(96, 96);
const focus = {
  x: 36 * TILE_SIZE,
  y: 41 * TILE_SIZE,
  w: 24 * TILE_SIZE,
  h: 14 * TILE_SIZE,
};
const viewport = { width: 1280, height: 720 };

describe('createFocusedCamera', () => {
  it('centres on the focus rectangle', () => {
    const cam = createFocusedCamera(world, focus, viewport);
    expect(cam.center.x).toBeCloseTo(focus.x + focus.w / 2);
    expect(cam.center.y).toBeCloseTo(focus.y + focus.h / 2);
  });

  it('zooms in so the focus fills the viewport, which is closer than the whole map', () => {
    const cam = createFocusedCamera(world, focus, viewport);
    const fitWhole = createFocusedCamera(
      world,
      { x: 0, y: 0, w: world.width, h: world.height },
      viewport,
    );
    expect(cam.zoom).toBeGreaterThan(fitWhole.zoom);
  });

  it('keeps an untouched camera on the focus when the viewport changes size', () => {
    const cam = createFocusedCamera(world, focus, viewport);
    const resized = resizeCamera(
      cam,
      world,
      { width: 900, height: 600 },
      1,
      focus,
    );
    expect(resized.center.x).toBeCloseTo(focus.x + focus.w / 2);
    expect(resized.zoom).toBeLessThan(cam.zoom);
  });
});
