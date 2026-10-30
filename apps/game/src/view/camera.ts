import { TILE_SIZE } from '@overpass-game/render-style';
import type { Vec2 } from '../input/intents.ts';
import type { TileXY } from '../input/path.ts';
import {
  FIT_PADDING_PX,
  MAX_TILE_SCREEN_PX,
  MIN_ZOOM_OF_FIT,
} from './config.ts';

/**
 * Camera math, pure and Phaser-free. The scene copies `zoom` and `center` onto
 * its Phaser camera (`setZoom`, `centerOn`), which also zooms about the centre.
 *
 * World space: one tile is TILE_SIZE units, the map spans [0, cols * TILE_SIZE].
 * Screen space: CSS pixels, origin at the top-left of the game canvas.
 */

export interface Size {
  width: number;
  height: number;
}

export interface CameraState {
  zoom: number;
  /** World point shown at the middle of the viewport. */
  center: Vec2;
  minZoom: number;
  maxZoom: number;
  /** False until the player pans or zooms; resizes refit an untouched camera. */
  moved: boolean;
}

export function worldSize(cols: number, rows: number): Size {
  return { width: cols * TILE_SIZE, height: rows * TILE_SIZE };
}

/** Zoom that shows the whole map inside the viewport, minus padding. */
export function fitZoom(world: Size, viewport: Size): number {
  const w = Math.max(1, viewport.width - 2 * FIT_PADDING_PX);
  const h = Math.max(1, viewport.height - 2 * FIT_PADDING_PX);
  return Math.min(w / world.width, h / world.height);
}

function limits(world: Size, viewport: Size): { min: number; max: number } {
  const fit = fitZoom(world, viewport);
  const min = fit * MIN_ZOOM_OF_FIT;
  // Small screens may need more than MAX_TILE_SCREEN_PX just to fit; never cap below the fit.
  const max = Math.max(fit, MAX_TILE_SCREEN_PX / TILE_SIZE);
  return { min, max };
}

/** A camera showing the whole map, centred. */
export function createFittedCamera(world: Size, viewport: Size): CameraState {
  const { min, max } = limits(world, viewport);
  return {
    zoom: fitZoom(world, viewport),
    center: { x: world.width / 2, y: world.height / 2 },
    minZoom: min,
    maxZoom: max,
    moved: false,
  };
}

/** Keeps the centre over the map so it can't be panned out of sight. */
function clampCenter(cam: CameraState, world: Size): void {
  cam.center.x = Math.min(world.width, Math.max(0, cam.center.x));
  cam.center.y = Math.min(world.height, Math.max(0, cam.center.y));
}

/**
 * Viewport changed size or orientation. An untouched camera refits; a moved one
 * keeps its centre and has its zoom clamped to the new limits.
 */
export function resizeCamera(
  cam: CameraState,
  world: Size,
  viewport: Size,
): CameraState {
  if (!cam.moved) return createFittedCamera(world, viewport);
  const { min, max } = limits(world, viewport);
  const next: CameraState = {
    ...cam,
    center: { ...cam.center },
    minZoom: min,
    maxZoom: max,
    zoom: Math.min(max, Math.max(min, cam.zoom)),
  };
  clampCenter(next, world);
  return next;
}

export function screenToWorld(cam: CameraState, viewport: Size, p: Vec2): Vec2 {
  return {
    x: cam.center.x + (p.x - viewport.width / 2) / cam.zoom,
    y: cam.center.y + (p.y - viewport.height / 2) / cam.zoom,
  };
}

export function worldToScreen(cam: CameraState, viewport: Size, p: Vec2): Vec2 {
  return {
    x: (p.x - cam.center.x) * cam.zoom + viewport.width / 2,
    y: (p.y - cam.center.y) * cam.zoom + viewport.height / 2,
  };
}

/** The tile under a world point. May lie outside the grid; the sim rejects those. */
export function worldToTile(p: Vec2): TileXY {
  return { x: Math.floor(p.x / TILE_SIZE), y: Math.floor(p.y / TILE_SIZE) };
}

/** Drag by screen pixels: the map follows the finger or cursor. */
export function panCamera(
  cam: CameraState,
  world: Size,
  dx: number,
  dy: number,
): void {
  cam.center.x -= dx / cam.zoom;
  cam.center.y -= dy / cam.zoom;
  cam.moved = true;
  clampCenter(cam, world);
}

/** Zooms by `factor`, keeping the world point under `screenPoint` fixed on screen. */
export function zoomCamera(
  cam: CameraState,
  world: Size,
  viewport: Size,
  factor: number,
  screenPoint: Vec2,
): void {
  const anchor = screenToWorld(cam, viewport, screenPoint);
  cam.zoom = Math.min(cam.maxZoom, Math.max(cam.minZoom, cam.zoom * factor));
  // Solve screenToWorld(screenPoint) === anchor for the new centre.
  cam.center.x = anchor.x - (screenPoint.x - viewport.width / 2) / cam.zoom;
  cam.center.y = anchor.y - (screenPoint.y - viewport.height / 2) / cam.zoom;
  cam.moved = true;
  clampCenter(cam, world);
}
