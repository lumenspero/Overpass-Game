import {
  DEBUG_PALETTE,
  GUIDE_STYLE,
  labelColour,
  PALETTE,
  type MapPalette,
} from '@overpass-game/render-style';
import { sampleSpline } from '@overpass-game/map-compiler';
import type {
  MapLabel,
  Polyline,
  Shape,
  SourceMap,
} from '@overpass-game/map-schema';
import { EDIT } from '../config.ts';
import type { Frame } from '../geo/frame.ts';
import type { Selection } from '../edit/editor.ts';
import { pixelToSource } from '../edit/coords.ts';
import { listItems, type Pt, type Target } from '../edit/hit.ts';
import { labelBox } from '../edit/labels.ts';
import { PAINT_SPECS, type PaintTool } from '../edit/paint.ts';
import type { Rect } from '../edit/select.ts';
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
  // Edit outlines for unselected shapes. Off by default so the preview shows the finished look.
  private outlines = false;
  private selection: Selection | null = null;
  private shapes: readonly Target[] = [];
  private marquee: Rect | null = null;
  private view = { zoom: 1, panX: 0, panY: 0 };
  // The palette the map is drawn with: the map's family, in light or dark mode.
  private palette: MapPalette = PALETTE;
  private selectedLabel: string | null = null;
  private pending: {
    tool: PaintTool;
    points: readonly Pt[];
    riverWidth: number;
  } | null = null;

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
  setEditState(
    editable: boolean,
    selection: Selection | null,
    shapes: readonly Target[],
  ): void {
    this.editable = editable;
    this.selection = selection;
    this.shapes = shapes;
    this.draw();
  }

  /** Draws the map in this palette: the base family in light or dark mode. */
  setPalette(palette: MapPalette): void {
    this.palette = palette;
    this.draw();
  }

  /** The label being edited, outlined with its corner grip. Null shows no label as selected. */
  setLabelSelection(id: string | null): void {
    this.selectedLabel = id;
    this.draw();
  }

  /** The shape being painted: its points so far, and the tool that will make it. Null hides it. */
  setPending(
    tool: PaintTool | null,
    points: readonly Pt[],
    riverWidth: number,
  ): void {
    this.pending = tool ? { tool, points, riverWidth } : null;
    this.draw();
  }

  /** Zooms about a client position, keeping the point under the pointer where it is. */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const cx = this.canvas.clientWidth / 2;
    const cy = this.canvas.clientHeight / 2;
    const qx = clientX - rect.left - cx;
    const qy = clientY - rect.top - cy;
    const z = this.view.zoom;
    const next = Math.min(
      EDIT.viewZoomMax,
      Math.max(EDIT.viewZoomMin, z * factor),
    );
    if (next === z) return;
    // The point under the pointer, before the zoom, in untransformed coordinates.
    const lx = (qx - this.view.panX) / z;
    const ly = (qy - this.view.panY) / z;
    this.view = { zoom: next, panX: qx - next * lx, panY: qy - next * ly };
    this.draw();
  }

  panBy(dx: number, dy: number): void {
    this.view = {
      zoom: this.view.zoom,
      panX: this.view.panX + dx,
      panY: this.view.panY + dy,
    };
    this.draw();
  }

  resetView(): void {
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.draw();
  }

  /** The box-select rectangle while it is being drawn, in source-grid units. Null hides it. */
  setMarquee(rect: Rect | null): void {
    this.marquee = rect;
    this.draw();
  }

  /** The preview transform: the fitted layout, zoomed and panned about the canvas centre. */
  private layoutFor(frame: Frame, width: number, height: number) {
    const base = previewLayout(frame, width, height);
    const z = this.view.zoom;
    const cx = width / 2;
    const cy = height / 2;
    const m = base.matrix;
    return {
      scale: base.scale * z,
      matrix: {
        a: z * m.a,
        b: z * m.b,
        c: z * m.c,
        d: z * m.d,
        e: cx + z * (m.e - cx) + this.view.panX,
        f: cy + z * (m.f - cy) + this.view.panY,
      },
    };
  }

  /** The source-grid point under a client position, or null when no frame is drawn. */
  locate(
    clientX: number,
    clientY: number,
  ): { point: Pt; tilesPerPixel: number } | null {
    const frame = this.frame;
    if (!frame) return null;
    const { scale, matrix } = this.layoutFor(
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

  /** Shows or hides the edit outlines of unselected shapes. Selected shapes are always outlined. */
  setOutlines(show: boolean): void {
    this.outlines = show;
    this.draw();
  }

  private draw(): void {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = hex(this.palette.background);
    ctx.fillRect(0, 0, width, height);

    const frame = this.frame;
    if (!frame) {
      ctx.fillStyle = '#888888';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Search for a place or draw a frame', width / 2, height / 2);
      return;
    }

    const { scale, matrix } = this.layoutFor(frame, width, height);
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

    ctx.fillStyle = hex(this.palette.land);
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

    ctx.strokeStyle = this.inside ? hex(this.palette.road) : OUTSIDE_COLOUR;
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(x0, y0, frame.cols, frame.rows);

    if (this.editable && this.source) {
      this.drawEditOverlay(this.source, frame, scale);
      this.drawLabelOverlay(this.source, frame, scale);
    }
    this.drawPending(frame, scale);
    if (this.marquee) {
      const r = this.marquee;
      ctx.beginPath();
      ctx.rect(
        r.x0 - frame.cols / 2,
        frame.rows / 2 - r.y1,
        r.x1 - r.x0,
        r.y1 - r.y0,
      );
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.strokeStyle = SELECTED_COLOUR;
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();
      ctx.setLineDash([]);
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

    const pal = this.palette;
    for (const shape of source.layers.parks)
      drawShape(shape, hex(pal.park), hex(pal.park));
    for (const shape of source.layers.mountains)
      drawShape(shape, hex(pal.mountain), hex(pal.mountain));
    for (const shape of source.layers.water)
      drawShape(shape, hex(pal.water), hex(pal.water));

    const drawGuide = (line: Polyline): void => {
      trace(line.points, false);
      ctx.strokeStyle = hex(pal.motorway);
      ctx.globalAlpha = GUIDE_STYLE.alpha;
      ctx.lineWidth = Math.max(GUIDE_STYLE.widthTiles, 1 / scale);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    for (const line of source.layers.motorwayGuide) drawGuide(line);

    for (const label of source.layers.labels) this.drawLabel(label, frame);
  }

  /**
   * One text label, centred on its position. The preview's transform flips the y axis, so the
   * text is turned back over to read upright.
   */
  private drawLabel(label: MapLabel, frame: Frame): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(label.x - frame.cols / 2, frame.rows / 2 - label.y);
    ctx.scale(1, -1);
    ctx.font = `${label.size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hex(labelColour(this.palette, label.kind));
    ctx.fillText(label.text, 0, 0);
    ctx.restore();
  }

  /**
   * Edit outlines for every label, a bold one for the selected label, and a corner grip on the
   * selected label that resizes it. Boxes match the editor's picking, so the grip is where it is hit.
   */
  private drawLabelOverlay(
    source: SourceMap,
    frame: Frame,
    scale: number,
  ): void {
    const { ctx } = this;
    const px = (n: number): number => n / scale;
    for (const label of source.layers.labels) {
      const box = labelBox(label);
      const selected = label.id === this.selectedLabel;
      // Source y runs south; the preview's local y runs north, so the box's top edge is y1.
      const u0 = box.x0 - frame.cols / 2;
      const u1 = box.x1 - frame.cols / 2;
      const v0 = frame.rows / 2 - box.y1;
      const v1 = frame.rows / 2 - box.y0;
      ctx.beginPath();
      ctx.rect(u0, v0, u1 - u0, v1 - v0);
      ctx.setLineDash([px(4), px(3)]);
      ctx.strokeStyle = selected ? SELECTED_COLOUR : OUTLINE_COLOUR;
      ctx.globalAlpha = selected ? 1 : 0.5;
      ctx.lineWidth = px(selected ? 1.5 : 1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Every label shows its corner grip, so it is clear what can be resized. The selected one is gold.
      // The grip sits at the source's bottom-right corner, which is local (u1, v0).
      const size = px(EDIT.anchorPx);
      ctx.beginPath();
      ctx.rect(u1 - size / 2, v0 - size / 2, size, size);
      ctx.fillStyle = selected ? SELECTED_COLOUR : OUTLINE_COLOUR;
      ctx.fill();
      ctx.strokeStyle = ANCHOR_EDGE_COLOUR;
      ctx.lineWidth = px(1);
      ctx.stroke();
    }
  }

  /**
   * The shape being painted: a dashed path through its points, a translucent band for a river,
   * and a dot on each point. Closed shapes show their closing edge too.
   */
  private drawPending(frame: Frame, scale: number): void {
    const p = this.pending;
    if (!p || p.points.length === 0) return;
    const { ctx } = this;
    const local = (q: Pt): Pt => ({
      x: q.x - frame.cols / 2,
      y: frame.rows / 2 - q.y,
    });
    const px = (n: number): number => n / scale;
    const pts = p.points.map(local);
    const closed = PAINT_SPECS[p.tool].form === 'closed';
    const trace = (): void => {
      ctx.beginPath();
      pts.forEach((q, i) => {
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      if (closed && pts.length > 2) ctx.closePath();
    };
    if (PAINT_SPECS[p.tool].form === 'stroke') {
      trace();
      ctx.strokeStyle = hex(this.palette.water);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = p.riverWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    trace();
    ctx.setLineDash([px(6), px(4)]);
    ctx.strokeStyle = SELECTED_COLOUR;
    ctx.lineWidth = px(2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const q of pts) {
      ctx.beginPath();
      ctx.arc(q.x, q.y, px(4), 0, Math.PI * 2);
      ctx.fillStyle = SELECTED_COLOUR;
      ctx.fill();
    }
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
      const selected = this.shapes.some(
        (t) => t.layer === layer && t.id === item.id,
      );

      if (!selected && !this.outlines) continue;
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
          selection?.index === i &&
          selection.layer === layer &&
          selection.id === item.id
            ? SELECTED_COLOUR
            : OUTLINE_COLOUR;
        ctx.fill();
        ctx.strokeStyle = ANCHOR_EDGE_COLOUR;
        ctx.lineWidth = px(1);
        ctx.stroke();
      });
    }
  }
}
