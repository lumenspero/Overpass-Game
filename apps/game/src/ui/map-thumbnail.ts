import type { CompiledMap } from '@overpass-game/map-schema';
import { resolvePalette, type ThemeMode } from '@overpass-game/render-style';
import { Terrain } from '@overpass-game/sim';

/**
 * Draws a compiled map's terrain into a round canvas for the map select. It paints tiles only,
 * with the map's own palette, so no geometry work is done here. The canvas is sized in CSS;
 * this sets its backing store to match the device pixel ratio.
 */

/** Size of the thumbnail in CSS pixels. */
export const THUMB_SIZE = 160;

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

export function drawThumbnail(
  canvas: HTMLCanvasElement,
  map: CompiledMap,
  mode: ThemeMode,
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(THUMB_SIZE * dpr);
  canvas.height = Math.round(THUMB_SIZE * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const palette = resolvePalette(map.palette, mode, map.waterPalette);
  // The map covers the disc: its shorter side fits across it and the longer side is cropped by
  // the circle, so no square edge of the map shows.
  const tile = THUMB_SIZE / Math.min(map.cols, map.rows);
  const ox = (THUMB_SIZE - map.cols * tile) / 2;
  const oy = (THUMB_SIZE - map.rows * tile) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(THUMB_SIZE / 2, THUMB_SIZE / 2, THUMB_SIZE / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = hex(palette.background);
  ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);

  const colours: Record<number, number> = {
    [Terrain.Land]: palette.land,
    [Terrain.Water]: palette.water,
    [Terrain.Mountain]: palette.mountain,
    [Terrain.Park]: palette.park,
  };
  for (let i = 0; i < map.terrain.length; i++) {
    const colour = colours[map.terrain[i]];
    if (colour === undefined) continue;
    ctx.fillStyle = hex(colour);
    const x = ox + (i % map.cols) * tile;
    const y = oy + Math.floor(i / map.cols) * tile;
    // A small overlap hides hairline gaps between tiles.
    ctx.fillRect(x, y, tile + 0.5, tile + 0.5);
  }
  ctx.restore();
}
