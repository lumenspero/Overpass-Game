import { DEBUG_PALETTE, PALETTE } from '@overpass-game/render-style';
import type { Frame } from '../geo/frame.ts';
import { previewLayout } from './layout.ts';

const OUTSIDE_COLOUR = '#e5484d';

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * Game-style preview of the map frame: the tile grid in the game's land
 * colour, turned to match the real map. It draws only; the frame state
 * comes from the app.
 */
export class PreviewCanvas {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private frame: Frame | null = null;
  private inside = true;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the preview canvas.');
    this.canvas = canvas;
    this.ctx = ctx;
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(canvas);
    this.draw();
  }

  setFrame(frame: Frame | null, inside: boolean): void {
    this.frame = frame;
    this.inside = inside;
    this.draw();
  }

  destroy(): void {
    this.observer.disconnect();
  }

  private draw(): void {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = hex(PALETTE.background);
    ctx.fillRect(0, 0, width, height);

    const frame = this.frame;
    if (!frame) {
      ctx.fillStyle = '#888888';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Search for a place or draw a frame', width / 2, height / 2);
      return;
    }

    const { scale, matrix } = previewLayout(frame, width, height);
    if (scale <= 0) return;

    const x0 = -frame.cols / 2;
    const y0 = -frame.rows / 2;
    ctx.save();
    ctx.setTransform(
      dpr * matrix.a,
      dpr * matrix.b,
      dpr * matrix.c,
      dpr * matrix.d,
      dpr * matrix.e,
      dpr * matrix.f,
    );

    ctx.fillStyle = hex(PALETTE.land);
    ctx.fillRect(x0, y0, frame.cols, frame.rows);

    ctx.strokeStyle = hex(DEBUG_PALETTE.grid);
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let i = 0; i <= frame.cols; i++) {
      ctx.moveTo(x0 + i, y0);
      ctx.lineTo(x0 + i, y0 + frame.rows);
    }
    for (let j = 0; j <= frame.rows; j++) {
      ctx.moveTo(x0, y0 + j);
      ctx.lineTo(x0 + frame.cols, y0 + j);
    }
    ctx.stroke();

    ctx.strokeStyle = this.inside ? hex(PALETTE.road) : OUTSIDE_COLOUR;
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(x0, y0, frame.cols, frame.rows);
    ctx.restore();
  }
}
