import { TILE_SIZE } from '@overpass-game/render-style';
import { describe, expect, it } from 'vitest';
import {
  type CameraState,
  createFittedCamera,
  fitBox,
  fitZoom,
  panCamera,
  resizeCamera,
  screenToWorld,
  type Size,
  worldSize,
  worldToScreen,
  worldToTile,
  zoomCamera,
} from './camera.ts';

const world = worldSize(40, 24);
const landscape: Size = { width: 1920, height: 1080 };
const portrait: Size = { width: 390, height: 844 };

/** The four corners of the viewport, in world units, must lie on the grid. */
function expectInsideGrid(cam: CameraState, viewport: Size): void {
  const eps = 1e-6;
  for (const p of [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: 0, y: viewport.height },
    { x: viewport.width, y: viewport.height },
  ]) {
    const w = screenToWorld(cam, viewport, p);
    expect(w.x).toBeGreaterThanOrEqual(-eps);
    expect(w.y).toBeGreaterThanOrEqual(-eps);
    expect(w.x).toBeLessThanOrEqual(world.width + eps);
    expect(w.y).toBeLessThanOrEqual(world.height + eps);
  }
}

describe('zoom floor', () => {
  it('opens so the map covers a landscape screen with no edge showing', () => {
    expectInsideGrid(createFittedCamera(world, landscape), landscape);
  });

  it('opens so the map covers a portrait phone with no edge showing', () => {
    expectInsideGrid(createFittedCamera(world, portrait), portrait);
  });

  it('sets the lowest zoom so the map fills one axis exactly', () => {
    const cam = createFittedCamera(world, landscape);
    expect(cam.minZoom).toBeCloseTo(
      Math.max(landscape.width / world.width, landscape.height / world.height),
    );
    // The map's top-left corner sits on one screen edge; on the other axis the map is cropped.
    const edge = worldToScreen(cam, landscape, { x: 0, y: 0 });
    expect(Math.max(edge.x, edge.y)).toBeCloseTo(0);
  });

  it('never caps max zoom below the fit on a tiny map', () => {
    const tiny = worldSize(2, 2);
    const cam = createFittedCamera(tiny, landscape);
    expect(cam.maxZoom).toBeGreaterThanOrEqual(cam.zoom);
  });

  it('never shows past the grid when zoomed out and panned to any corner', () => {
    const cam = createFittedCamera(world, portrait);
    zoomCamera(cam, world, portrait, 1e-6, { x: 0, y: 0 });
    for (const d of [
      [1e6, 1e6],
      [-1e6, 1e6],
      [1e6, -1e6],
      [-1e6, -1e6],
    ]) {
      panCamera(cam, world, portrait, d[0], d[1]);
      expectInsideGrid(cam, portrait);
    }
  });
});

describe('conversions', () => {
  it('screen and world round-trip', () => {
    const cam = createFittedCamera(world, portrait);
    const p = { x: 123.5, y: 456.25 };
    const back = worldToScreen(cam, portrait, screenToWorld(cam, portrait, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('maps world points to tiles, including outside the grid', () => {
    expect(worldToTile({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(worldToTile({ x: TILE_SIZE - 0.01, y: TILE_SIZE })).toEqual({
      x: 0,
      y: 1,
    });
    expect(worldToTile({ x: -1, y: -1 })).toEqual({ x: -1, y: -1 });
  });
});

describe('pan and zoom', () => {
  it('pans so the map follows the pointer', () => {
    const cam = createFittedCamera(world, landscape);
    zoomCamera(cam, world, landscape, 2, { x: 960, y: 540 });
    const before = screenToWorld(cam, landscape, { x: 500, y: 500 });
    panCamera(cam, world, landscape, 30, -20);
    const after = worldToScreen(cam, landscape, before);
    expect(after.x).toBeCloseTo(530);
    expect(after.y).toBeCloseTo(480);
    expect(cam.moved).toBe(true);
  });

  it('keeps the view inside the map, centring on an axis the map fills', () => {
    const cam = createFittedCamera(world, landscape);
    panCamera(cam, world, landscape, 1e6, -1e6);
    expect(cam.center.x).toBeCloseTo(world.width / 2);
    expect(cam.center.y).toBeCloseTo(
      world.height - landscape.height / cam.zoom / 2,
    );
    expectInsideGrid(cam, landscape);
  });

  it('zooms about the pointer', () => {
    const cam = createFittedCamera(world, landscape);
    const pointer = { x: 700, y: 400 };
    const anchor = screenToWorld(cam, landscape, pointer);
    zoomCamera(cam, world, landscape, 1.5, pointer);
    const after = worldToScreen(cam, landscape, anchor);
    expect(after.x).toBeCloseTo(pointer.x);
    expect(after.y).toBeCloseTo(pointer.y);
  });

  it('clamps zoom to its limits', () => {
    const cam = createFittedCamera(world, landscape);
    zoomCamera(cam, world, landscape, 1000, { x: 0, y: 0 });
    expect(cam.zoom).toBe(cam.maxZoom);
    zoomCamera(cam, world, landscape, 1e-6, { x: 0, y: 0 });
    expect(cam.zoom).toBe(cam.minZoom);
  });
});

describe('resize', () => {
  it('refits an untouched camera on rotation', () => {
    const cam = createFittedCamera(world, portrait);
    const rotated = { width: portrait.height, height: portrait.width };
    expect(resizeCamera(cam, world, rotated)).toEqual(
      createFittedCamera(world, rotated),
    );
  });

  it('keeps a moved camera where the player left it, within new limits', () => {
    const cam = createFittedCamera(world, landscape);
    zoomCamera(cam, world, landscape, 3, { x: 300, y: 300 });
    const next = resizeCamera(cam, world, portrait);
    expect(next.center).toEqual(cam.center);
    expect(next.zoom).toBeGreaterThanOrEqual(next.minZoom);
    expect(next.zoom).toBeLessThanOrEqual(next.maxZoom);
    expect(next.moved).toBe(true);
  });
});

describe('zoom level', () => {
  it('multiplies the fit zoom at 1, 1.5 and 2, within the limits', () => {
    const fit = fitZoom(world, landscape);
    const { minZoom: floor, maxZoom: ceiling } = createFittedCamera(
      world,
      landscape,
    );
    for (const level of [1, 1.5, 2]) {
      const zoom = createFittedCamera(world, landscape, level).zoom;
      expect(zoom).toBeCloseTo(Math.min(ceiling, Math.max(floor, fit * level)));
    }
  });

  it('keeps the zoom within the limits', () => {
    const cam = createFittedCamera(world, landscape, 2);
    expect(cam.zoom).toBeLessThanOrEqual(cam.maxZoom);
    expect(cam.zoom).toBeGreaterThanOrEqual(cam.minZoom);
  });
});

describe('fitBox', () => {
  it('centres on the box and fills the viewport with it', () => {
    const cam = createFittedCamera(world, landscape);
    const box = { minX: 600, minY: 350, maxX: 680, maxY: 420 };
    const next = fitBox(cam, world, landscape, box);
    expect(next.moved).toBe(true);
    expect(next.center.x).toBeCloseTo(640);
    expect(next.center.y).toBeCloseTo(385);
    expect(next.zoom).toBeGreaterThan(cam.zoom);
    expect(next.zoom).toBeLessThanOrEqual(next.maxZoom);
  });

  it('treats a box smaller than a tile as one tile', () => {
    const cam = createFittedCamera(world, landscape);
    const point = { minX: 50, minY: 50, maxX: 50, maxY: 50 };
    const next = fitBox(cam, world, landscape, point);
    const tile = {
      minX: 50,
      minY: 50,
      maxX: 50 + TILE_SIZE,
      maxY: 50 + TILE_SIZE,
    };
    expect(next.zoom).toBeCloseTo(fitBox(cam, world, landscape, tile).zoom);
  });
});
