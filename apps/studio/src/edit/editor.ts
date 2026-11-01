import type { SourceMap } from '@overpass-game/map-schema';
import { EDIT, IMPORT } from '../config.ts';
import * as history from './history.ts';
import {
  anchorOf,
  centreOf,
  findItem,
  handleOf,
  type Hit,
  type Pt,
  type Target,
} from './hit.ts';
import {
  buildPainted,
  PAINT_SPECS,
  type PaintTool,
  type Tool,
} from './paint.ts';
import * as ops from './ops.ts';

export interface Selection extends Target {
  /** The selected point, or null when the whole shape is selected. */
  readonly index: number | null;
}

type Drag =
  | {
      readonly kind: 'point';
      readonly target: Target;
      readonly index: number;
      readonly offset: Pt;
    }
  | {
      readonly kind: 'handle';
      readonly target: Target;
      readonly index: number;
      readonly which: 'handleIn' | 'handleOut';
      readonly offset: Pt;
    }
  | { readonly kind: 'body'; readonly target: Target; readonly start: Pt };

const offsetBetween = (from: Pt, to: Pt): Pt => ({
  x: to.x - from.x,
  y: to.y - from.y,
});

/**
 * One drag step, computed from the map as it was when the drag began, so every pointer move
 * replaces the previous one rather than stacking on it.
 */
function applyDrag(
  base: SourceMap,
  drag: Drag,
  at: Pt,
  step: number,
): SourceMap {
  const { layer, id } = drag.target;
  switch (drag.kind) {
    case 'point':
      return ops.movePoint(
        base,
        layer,
        id,
        drag.index,
        { x: at.x + drag.offset.x, y: at.y + drag.offset.y },
        step,
      );
    case 'handle':
      return ops.moveHandle(
        base,
        layer,
        id,
        drag.index,
        drag.which,
        { x: at.x + drag.offset.x, y: at.y + drag.offset.y },
        step,
      );
    case 'body': {
      const dx = ops.snapValue(at.x - drag.start.x, step);
      const dy = ops.snapValue(at.y - drag.start.y, step);
      if (dx === 0 && dy === 0) return base;
      return ops.translateShape(base, layer, id, dx, dy);
    }
  }
}

/**
 * The editing state for the Studio: the map, its undo history, the selection, the drag in
 * progress, and the shape being painted. It has no DOM and no rendering; the canvas and panels
 * read it and call into it.
 *
 * A drag is one undo step. While it runs, `map` shows the drag's draft, and the history is
 * untouched until `endDrag`. Cancelling a drag leaves no step.
 *
 * A painted shape is also one step, made when it is finished. Its points wait in `pending`
 * until then, so Ctrl+Z first removes the last pending point.
 */
export class Editor {
  private timeline: history.History<SourceMap>;
  private gesture: { readonly drag: Drag; readonly base: SourceMap } | null =
    null;
  private draft: SourceMap | null = null;
  private sel: Selection | null = null;
  private toolState: Tool = 'select';
  private pending: readonly Pt[] = [];
  private river: number = IMPORT.riverWidthDefault;
  private readonly listeners = new Set<() => void>();

  constructor(map: SourceMap) {
    this.timeline = history.createHistory(map);
  }

  /** The map to draw: the drag's draft while dragging, otherwise the last committed state. */
  get map(): SourceMap {
    return this.draft ?? this.timeline.present;
  }

  get selection(): Selection | null {
    return this.sel;
  }

  get tool(): Tool {
    return this.toolState;
  }

  /** Points of the shape being painted, not yet committed. */
  get pendingPoints(): readonly Pt[] {
    return this.pending;
  }

  /** Width in tiles for the next river. */
  get riverWidth(): number {
    return this.river;
  }

  /** True when the current tool makes a closed shape, which a click on its first point closes. */
  get closesOnFirst(): boolean {
    return (
      this.toolState !== 'select' &&
      PAINT_SPECS[this.toolState].form === 'closed'
    );
  }

  get undoable(): boolean {
    return (
      this.gesture === null &&
      (this.pending.length > 0 || history.canUndo(this.timeline))
    );
  }

  get redoable(): boolean {
    return this.gesture === null && history.canRedo(this.timeline);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Starts over with a new map: history, selection, pending points and any drag are cleared. */
  load(map: SourceMap): void {
    this.timeline = history.createHistory(map);
    this.gesture = null;
    this.draft = null;
    this.sel = null;
    this.pending = [];
    this.emit();
  }

  select(sel: Selection | null): void {
    this.sel = sel;
    this.settle();
    this.emit();
  }

  beginDrag(hit: Hit, at: Pt): void {
    const base = this.timeline.present;
    const target: Target = { layer: hit.layer, id: hit.id };
    let drag: Drag;
    let index: number | null = null;
    if (hit.kind === 'point') {
      const pos = anchorOf(base, target, hit.index);
      if (!pos) return;
      index = hit.index;
      drag = {
        kind: 'point',
        target,
        index: hit.index,
        offset: offsetBetween(at, pos),
      };
    } else if (hit.kind === 'handle') {
      const pos = handleOf(base, target, hit.index, hit.which);
      if (!pos) return;
      index = hit.index;
      drag = {
        kind: 'handle',
        target,
        index: hit.index,
        which: hit.which,
        offset: offsetBetween(at, pos),
      };
    } else {
      // Edges and insides both move the whole shape.
      drag = { kind: 'body', target, start: at };
    }
    this.sel = { layer: target.layer, id: target.id, index };
    this.gesture = { drag, base };
    this.draft = null;
    this.emit();
  }

  dragTo(at: Pt): void {
    if (!this.gesture) return;
    const current = this.draft ?? this.gesture.base;
    const next = applyDrag(
      this.gesture.base,
      this.gesture.drag,
      at,
      EDIT.snapStep,
    );
    if (next === current) return;
    this.draft = next;
    this.emit();
  }

  endDrag(): void {
    if (!this.gesture) return;
    const final = this.draft ?? this.gesture.base;
    this.gesture = null;
    this.draft = null;
    this.timeline = history.commit(this.timeline, final, EDIT.historyLimit);
    this.settle();
    this.emit();
  }

  cancelDrag(): void {
    if (!this.gesture) return;
    this.gesture = null;
    this.draft = null;
    this.emit();
  }

  /** Applies one change as a single undo step. A change that does nothing leaves no step. */
  apply(change: (m: SourceMap) => SourceMap): void {
    this.gesture = null;
    this.draft = null;
    this.timeline = history.commit(
      this.timeline,
      change(this.timeline.present),
      EDIT.historyLimit,
    );
    this.settle();
    this.emit();
  }

  /** Removes the last pending point if there is one; otherwise undoes the last step. */
  undo(): void {
    if (this.gesture) return;
    if (this.pending.length > 0) {
      this.pending = this.pending.slice(0, -1);
    } else {
      this.timeline = history.undo(this.timeline);
      this.settle();
    }
    this.emit();
  }

  redo(): void {
    if (this.gesture) return;
    this.timeline = history.redo(this.timeline);
    this.settle();
    this.emit();
  }

  deleteSelectedPoint(): void {
    const s = this.sel;
    if (!s || s.index === null) return;
    const { layer, id, index } = s;
    this.apply((m) => ops.deletePoint(m, layer, id, index));
  }

  /** Adds a point on segment `segment`, and selects it if the shape changed. */
  insertOnSegment(
    layer: Selection['layer'],
    id: string,
    segment: number,
  ): void {
    const target: Target = { layer, id };
    const before = findItem(this.timeline.present, target)?.points.length ?? 0;
    this.apply((m) => ops.insertPoint(m, layer, id, segment));
    const after = findItem(this.timeline.present, target)?.points.length ?? 0;
    this.sel = { layer, id, index: after > before ? segment + 1 : null };
    this.settle();
    this.emit();
  }

  rotateSelected(degrees: number): void {
    const s = this.sel;
    if (!s) return;
    const c = centreOf(this.timeline.present, s);
    if (!c) return;
    const radians = (degrees * Math.PI) / 180;
    this.apply((m) => ops.rotateShape(m, s.layer, s.id, c.x, c.y, radians));
  }

  scaleSelected(factor: number): void {
    const s = this.sel;
    if (!s) return;
    const c = centreOf(this.timeline.present, s);
    if (!c) return;
    this.apply((m) => ops.scaleShape(m, s.layer, s.id, c.x, c.y, factor));
  }

  /** Switches tool. Points pending for the old tool are dropped. */
  setTool(tool: Tool): void {
    if (tool === this.toolState) return;
    this.toolState = tool;
    this.pending = [];
    this.emit();
  }

  setRiverWidth(width: number): void {
    if (!(width > 0) || width === this.river) return;
    this.river = width;
    this.emit();
  }

  /** Adds a point to the shape being painted, snapped to the grid. */
  addPaintPoint(at: Pt): void {
    if (this.toolState === 'select') return;
    this.pending = [...this.pending, ops.snapPoint(at, EDIT.snapStep)];
    this.emit();
  }

  /**
   * Makes the painted shape from the pending points and selects it. A shape with too few
   * points is dropped without a step. The tool stays active, so several shapes can be painted in
   * a row.
   */
  finishPaint(): void {
    const tool = this.toolState;
    if (tool === 'select') return;
    const built = buildPainted(
      this.timeline.present,
      tool as PaintTool,
      this.pending,
      {
        riverWidth: this.river,
        spawnWeight: EDIT.spawnWeight,
      },
    );
    this.pending = [];
    if (built) {
      this.apply((m) => ops.addItem(m, built.layer, built.item));
      this.sel = { layer: built.layer, id: built.item.id, index: null };
    }
    this.settle();
    this.emit();
  }

  /** Removes the last pending point only. Unlike undo, it never reaches back to a finished shape. */
  removePaintPoint(): void {
    if (this.pending.length === 0) return;
    this.pending = this.pending.slice(0, -1);
    this.emit();
  }

  /** Drops the pending shape without making it. */
  cancelPaint(): void {
    if (this.pending.length === 0) return;
    this.pending = [];
    this.emit();
  }

  /** Keeps the selection valid after an undo, redo or edit. */
  private settle(): void {
    const s = this.sel;
    if (!s) return;
    const item = findItem(this.timeline.present, s);
    if (!item) {
      this.sel = null;
      return;
    }
    if (s.index !== null && s.index >= item.points.length) {
      this.sel = { layer: s.layer, id: s.id, index: null };
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
