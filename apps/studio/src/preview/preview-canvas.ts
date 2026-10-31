import {
  DEBUG_PALETTE,
  GUIDE_STYLE,
  PALETTE,
} from '@overpass-game/render-style';
import { sampleSpline } from '@overpass-game/map-compiler';
import type { Polyline, Shape, SourceMap } from '@overpass-game/map-schema';
import type { Frame } from '../geo/frame.ts';
import { previewLayout } from './layout.ts';

const OUTSIDE_COLOUR = '#e5484d';

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * Game-style preview of the map frame: the tile grid in the game's land
 * colour, turned to match the real map, with any imported features drawn on
 * top. It draws only; the frame and source state come from the app.
 */
export class PreviewCanvas {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private frame: Frame | null = null;
  private inside = true;
  private source: SourceMap | null = null;

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

  /** Imported features for the current frame, or null to show only the grid. */
  setSource(source: SourceMap | null): void {
    this.source = source;
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

    if (this.source) {
      // Imported shapes can run past the frame; keep them inside the grid.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, frame.cols, frame.rows);
      ctx.clip();
      this.drawSource(this.source, frame, scale);
      ctx.restore();
    }

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

  /** Draws imported layers in tile-local coordinates (origin at the centre, north up). */
  private drawSource(source: SourceMap, frame: Frame, scale: number): void {
    const { ctx } = this;
    const toLocal = (p: { x: number; y: number }): [number, number] => [
      p.x - frame.cols / 2,
      frame.rows / 2 - p.y,
    ];

    const trace = (
      points: { x: number; y: number }[],
      closed: boolean,
    ): void => {
      ctx.beginPath();
      points.forEach((p, i) => {
        const [u, v] = toLocal(p);
        if (i === 0) ctx.moveTo(u, v);
        else ctx.lineTo(u, v);
      });
      if (closed) ctx.closePath();
    };

    const drawShape = (shape: Shape, fill: string, stroke: string): void => {
      const closed = shape.kind === 'closedSpline';
      trace(sampleSpline(shape.points, closed), closed);
      if (closed) {
        ctx.fillStyle = fill;
        ctx.fill();
      } else {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = shape.width ?? 0.25;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    };

    for (const shape of source.layers.parks)
      drawShape(shape, hex(PALETTE.park), hex(PALETTE.park));
    for (const shape of source.layers.mountains)
      drawShape(shape, hex(PALETTE.mountain), hex(PALETTE.mountain));
    for (const shape of source.layers.water)
      drawShape(shape, hex(PALETTE.water), hex(PALETTE.water));

    const drawGuide = (line: Polyline): void => {
      trace(line.points, false);
      ctx.strokeStyle = hex(PALETTE.motorway);
      ctx.globalAlpha = GUIDE_STYLE.alpha;
      ctx.lineWidth = Math.max(GUIDE_STYLE.widthTiles, 1 / scale);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    for (const line of source.layers.motorwayGuide) drawGuide(line);
  }
}
