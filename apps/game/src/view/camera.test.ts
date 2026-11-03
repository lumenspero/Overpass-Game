import { TILE_SIZE } from '@overpass-game/render-style';
import { describe, expect, it } from 'vitest';
import {
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
import {
  FIT_PADDING_PX,
  MAX_TILE_SCREEN_PX,
  MIN_ZOOM_OF_FIT,
} from './config.ts';

const world = worldSize(40, 24);
const landscape: Size = { width: 1920, height: 1080 };
const portrait: Size = { width: 390, height: 844 };

/** Map corners on screen must sit inside the viewport, with at least the padding. */
function expectMapFits(viewport: Size): void {
  const cam = createFittedCamera(world, viewport);
  const tl = worldToScreen(cam, viewport, { x: 0, y: 0 });
  const br = worldToScreen(cam, viewport, {
    x: world.width,
    y: world.height,
  });
  expect(tl.x).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-6);
  expect(tl.y).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-6);
  expect(br.x).toBeLessThanOrEqual(viewport.width - FIT_PADDING_PX + 1e-6);
  expect(br.y).toBeLessThanOrEqual(viewport.height - FIT_PADDING_PX + 1e-6);
  // And it is centred.
  expect(tl.x + br.x).toBeCloseTo(viewport.width);
  expect(tl.y + br.y).toBeCloseTo(viewport.height);
}

describe('fit', () => {
  it('fits a landscape map on a landscape screen', () => {
    expectMapFits(landscape);
  });

  it('fits the same map on a portrait phone', () => {
    expectMapFits(portrait);
  });

  it('touches the padding on the limiting axis', () => {
    const z = fitZoom(world, portrait);
    expect(world.width * z).toBeCloseTo(portrait.width - 2 * FIT_PADDING_PX);
  });

  it('sets zoom limits around the fit', () => {
    const cam = createFittedCamera(world, landscape);
    expect(cam.minZoom).toBeCloseTo(cam.zoom * MIN_ZOOM_OF_FIT);
    expect(cam.maxZoom).toBeCloseTo(MAX_TILE_SCREEN_PX / TILE_SIZE);
  });

  it('never caps max zoom below the fit on a tiny map', () => {
    const tiny = worldSize(2, 2);
    const cam = createFittedCamera(tiny, landscape);
    expect(cam.maxZoom).toBeGreaterThanOrEqual(cam.zoom);
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
    panCamera(cam, world, 30, -20);
    const after = worldToScreen(cam, landscape, before);
    expect(after.x).toBeCloseTo(530);
    expect(after.y).toBeCloseTo(480);
    expect(cam.moved).toBe(true);
  });

  it('keeps the centre over the map', () => {
    const cam = createFittedCamera(world, landscape);
    panCamera(cam, world, 1e6, -1e6);
    expect(cam.center).toEqual({ x: 0, y: world.height });
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
  it('opens at the fit zoom at level 1, and multiplies it at 1.5 and 2', () => {
    const fit = fitZoom(world, landscape);
    expect(createFittedCamera(world, landscape, 1).zoom).toBeCloseTo(fit);
    expect(createFittedCamera(world, landscape, 1.5).zoom).toBeCloseTo(
      fit * 1.5,
    );
    expect(createFittedCamera(world, landscape, 2).zoom).toBeCloseTo(fit * 2);
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
    const box = { minX: 100, minY: 100, maxX: 300, maxY: 200 };
    const next = fitBox(cam, world, landscape, box);
    expect(next.moved).toBe(true);
    expect(next.center.x).toBeCloseTo(200);
    expect(next.center.y).toBeCloseTo(150);
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
