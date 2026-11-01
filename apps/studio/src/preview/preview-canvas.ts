import {
  DEBUG_PALETTE,
  GUIDE_STYLE,
  PALETTE,
} from '@overpass-game/render-style';
import { sampleSpline } from '@overpass-game/map-compiler';
import type { Polyline, Shape, SourceMap } from '@overpass-game/map-schema';
import { EDIT } from '../config.ts';
import type { Frame } from '../geo/frame.ts';
import type { Selection } from '../edit/editor.ts';
import { pixelToSource } from '../edit/coords.ts';
import { listItems, type Pt } from '../edit/hit.ts';
import { previewLayout } from './layout.ts';

const OUTSIDE_COLOUR = '#e5484d';
const OUTLINE_COLOUR = '#ffffff';
const SELECTED_COLOUR = '#ffd60a';
const ANCHOR_EDGE_COLOUR = '#111111';

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * Game-style preview of the map frame: the tile grid in the game's land
 * colour, turned to match the real map, with any imported features drawn on
 * top. When editing is on, shapes get bold outlines, and the selected shape
 * shows its anchors and handles. It draws only; the frame, the map and the
 * selection come from the app and the editor.
 */
export class PreviewCanvas {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private frame: Frame | null = null;
  private inside = true;
  private source: SourceMap | null = null;
  private editable = false;
  private selection: Selection | null = null;

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

  /** Turns the editing overlay on or off for the drawn source, and sets the selection it shows. */
  setEditState(editable: boolean, selection: Selection | null): void {
    this.editable = editable;
    this.selection = selection;
    this.draw();
  }

  /** The source-grid point under a client position, or null when no frame is drawn. */
  locate(
    clientX: number,
    clientY: number,
  ): { point: Pt; tilesPerPixel: number } | null {
    const frame = this.frame;
    if (!frame) return null;
    const { scale, matrix } = previewLayout(
      frame,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
    );
    if (scale <= 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    const point = pixelToSource(
      matrix,
      frame.cols,
      frame.rows,
      clientX - rect.left,
      clientY - rect.top,
    );
    return point ? { point, tilesPerPixel: 1 / scale } : null;
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

    if (this.editable && this.source) {
      this.drawEditOverlay(this.source, frame, scale);
    }
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

  /**
   * Bold outlines on every shape, and for the selected shape its handle arms, handle dots and
   * anchor squares. Sizes are in screen pixels, converted to tiles with the current scale.
   */
  private drawEditOverlay(
    source: SourceMap,
    frame: Frame,
    scale: number,
  ): void {
    const { ctx } = this;
    const local = (p: { x: number; y: number }): Pt => ({
      x: p.x - frame.cols / 2,
      y: frame.rows / 2 - p.y,
    });
    const px = (n: number): number => n / scale;
    const selection = this.selection;

    for (const { layer, item } of listItems(source)) {
      const closed = item.kind === 'closedSpline';
      const selected =
        selection !== null &&
        selection.layer === layer &&
        selection.id === item.id;

      const ring = sampleSpline(item.points, closed);
      ctx.beginPath();
      ring.forEach((p, i) => {
        const q = local(p);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      if (closed) ctx.closePath();
      ctx.strokeStyle = selected ? SELECTED_COLOUR : OUTLINE_COLOUR;
      ctx.lineWidth = px(EDIT.outlinePx);
      ctx.lineJoin = 'round';
      ctx.stroke();

      if (!selected) continue;

      ctx.beginPath();
      for (const p of item.points) {
        const anchor = local(p);
        for (const off of [p.handleIn, p.handleOut]) {
          if (!off) continue;
          const handle = local({ x: p.x + off.x, y: p.y + off.y });
          ctx.moveTo(anchor.x, anchor.y);
          ctx.lineTo(handle.x, handle.y);
        }
      }
      ctx.strokeStyle = SELECTED_COLOUR;
      ctx.lineWidth = px(1);
      ctx.stroke();

      for (const p of item.points) {
        for (const off of [p.handleIn, p.handleOut]) {
          if (!off) continue;
          const handle = local({ x: p.x + off.x, y: p.y + off.y });
          ctx.beginPath();
          ctx.arc(handle.x, handle.y, px(EDIT.handlePx / 2), 0, Math.PI * 2);
          ctx.fillStyle = SELECTED_COLOUR;
          ctx.fill();
        }
      }

      const size = px(EDIT.anchorPx);
      item.points.forEach((p, i) => {
        const a = local(p);
        ctx.beginPath();
        ctx.rect(a.x - size / 2, a.y - size / 2, size, size);
        ctx.fillStyle =
          selection?.index === i ? SELECTED_COLOUR : OUTLINE_COLOUR;
        ctx.fill();
        ctx.strokeStyle = ANCHOR_EDGE_COLOUR;
        ctx.lineWidth = px(1);
        ctx.stroke();
      });
    }
  }
}
