import type {
  MapLabel,
  RestrictableOffer,
  SourceMap,
} from '@overpass-game/map-schema';
import { EDIT, IMPORT } from '../config.ts';
import * as history from './history.ts';
import {
  anchorOf,
  findItem,
  groupCentre,
  handleOf,
  hitTest,
  listItems,
  type EditItem,
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
import { insideRect, lengthOf, type Rect } from './select.ts';
import type { EditableLayer } from './ops.ts';
import {
  LABEL_DEFAULT_TEXT,
  LABEL_SIZE,
  labelBox,
  pickLabel,
  type LabelGrip,
} from './labels.ts';

/** The point (or whole shape) the primary selection is on. */
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
  | {
      readonly kind: 'body';
      readonly targets: readonly Target[];
      readonly start: Pt;
    }
  | { readonly kind: 'label'; readonly id: string; readonly offset: Pt }
  | {
      readonly kind: 'labelSize';
      readonly id: string;
      readonly centre: Pt;
      readonly startSize: number;
      readonly startDist: number;
    };

const sameTarget = (a: Target, b: Target): boolean =>
  a.layer === b.layer && a.id === b.id;
const toTarget = (s: Selection): Target => ({ layer: s.layer, id: s.id });
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
  switch (drag.kind) {
    case 'point': {
      const { layer, id } = drag.target;
      return ops.movePoint(
        base,
        layer,
        id,
        drag.index,
        { x: at.x + drag.offset.x, y: at.y + drag.offset.y },
        step,
      );
    }
    case 'handle': {
      const { layer, id } = drag.target;
      return ops.moveHandle(
        base,
        layer,
        id,
        drag.index,
        drag.which,
        { x: at.x + drag.offset.x, y: at.y + drag.offset.y },
        step,
      );
    }
    case 'body': {
      const dx = ops.snapValue(at.x - drag.start.x, step);
      const dy = ops.snapValue(at.y - drag.start.y, step);
      if (dx === 0 && dy === 0) return base;
      return drag.targets.reduce(
        (m, t) => ops.translateShape(m, t.layer, t.id, dx, dy),
        base,
      );
    }
    case 'label': {
      const x = ops.snapValue(at.x + drag.offset.x, step);
      const y = ops.snapValue(at.y + drag.offset.y, step);
      return ops.moveLabel(base, drag.id, x, y);
    }
    case 'labelSize': {
      // The size follows the pointer's distance from the label's centre, so the corner stays under the pointer.
      const dist = Math.hypot(at.x - drag.centre.x, at.y - drag.centre.y);
      const size =
        Math.round(((drag.startSize * dist) / drag.startDist) * 10) / 10;
      return ops.setLabel(base, drag.id, { size });
    }
  }
}

/**
 * The editing state for the Studio: the map, its undo history, the selection, the drag in
 * progress, the shape being painted, and the layer and snapping settings. It has no DOM and no
 * rendering; the canvas and panels read it and call into it.
 *
 * A drag is one undo step. While it runs, `map` shows the drag's draft, and the history is
 * untouched until `endDrag`. Cancelling a drag leaves no step.
 *
 * A painted shape is also one step, made when it is finished. Its points wait in `pending`
 * until then, so Ctrl+Z first removes the last pending point.
 *
 * Layer visibility and lock are authoring views, not map data: a hidden layer is only hidden
 * from `display`, and a locked layer cannot be picked. A shape's own lock is map data, and it
 * is saved with the map.
 */
export class Editor {
  private timeline: history.History<SourceMap>;
  private gesture: { readonly drag: Drag; readonly base: SourceMap } | null =
    null;
  private draft: SourceMap | null = null;
  /** The primary selection: the last shape chosen, and a point on it when one is picked. */
  private sel: Selection | null = null;
  /** Other shapes in a multi-selection, in the order they were chosen. */
  private extra: Target[] = [];
  private toolState: Tool = 'select';
  /** The selected text label, if any. A label and a shape are never selected at once. */
  private labelSel: string | null = null;
  /** The kind a new label gets, and the kind shown for the selected label. */
  private labelKind: MapLabel['kind'] = 'park';
  private pending: readonly Pt[] = [];
  private river: number = IMPORT.riverWidthDefault;
  private snapOn = true;
  private readonly hidden = new Set<EditableLayer>();
  private readonly locked = new Set<EditableLayer>();
  private displayCache: {
    base: SourceMap;
    key: string;
    value: SourceMap;
  } | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(map: SourceMap) {
    this.timeline = history.createHistory(map);
  }

  /** The map to edit and save: the drag's draft while dragging, otherwise the last committed state. */
  get map(): SourceMap {
    return this.draft ?? this.timeline.present;
  }

  /** The map to draw: `map` with the hidden layers emptied. Cached, so it changes only with the map. */
  get display(): SourceMap {
    const base = this.map;
    const key = [...this.hidden].sort().join(',');
    const cache = this.displayCache;
    if (cache && cache.base === base && cache.key === key) return cache.value;
    let value = base;
    for (const layer of this.hidden) value = ops.replaceLayer(value, layer, []);
    this.displayCache = { base, key, value };
    return value;
  }

  get selection(): Selection | null {
    return this.sel;
  }

  /** Every selected shape, the primary one last. */
  get selectedShapes(): Target[] {
    return this.sel ? [...this.extra, toTarget(this.sel)] : [...this.extra];
  }

  get tool(): Tool {
    return this.toolState;
  }

  get selectedLabelId(): string | null {
    return this.labelSel;
  }

  /** The selected label as the map now holds it, including any drag in progress. */
  get selectedLabel(): MapLabel | null {
    if (!this.labelSel) return null;
    return this.map.layers.labels.find((l) => l.id === this.labelSel) ?? null;
  }

  /** The kind of the selected label, or of the next label to be placed when none is selected. */
  get labelKindValue(): MapLabel['kind'] {
    return this.selectedLabel?.kind ?? this.labelKind;
  }

  /** Points of the shape being painted, not yet committed. */
  get pendingPoints(): readonly Pt[] {
    return this.pending;
  }

  /** Width in tiles for the next river. */
  get riverWidth(): number {
    return this.river;
  }

  get snapping(): boolean {
    return this.snapOn;
  }

  get hiddenLayers(): ReadonlySet<EditableLayer> {
    return this.hidden;
  }

  get lockedLayers(): ReadonlySet<EditableLayer> {
    return this.locked;
  }

  /** True when the current tool makes a closed shape, which a click on its first point closes. */
  get closesOnFirst(): boolean {
    const tool = this.toolState;
    return (
      tool !== 'select' &&
      tool !== 'label' &&
      PAINT_SPECS[tool].form === 'closed'
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
    this.extra = [];
    this.pending = [];
    this.hidden.clear();
    this.locked.clear();
    this.emit();
  }

  /** Selects one point or one whole shape, replacing any multi-selection and any selected label. */
  select(sel: Selection | null): void {
    this.sel = sel;
    this.extra = [];
    this.labelSel = null;
    this.settle();
    this.emit();
  }

  /** Selects one label, or none. Shapes are deselected. */
  selectLabel(id: string | null): void {
    this.labelSel = id;
    this.sel = null;
    this.extra = [];
    this.settle();
    this.emit();
  }

  /** Shapes in layers that are shown and not locked, and that pass `keep`. */
  private matching(keep: (item: EditItem) => boolean): Target[] {
    const out: Target[] = [];
    for (const { layer, item } of listItems(this.timeline.present)) {
      if (this.hidden.has(layer) || this.locked.has(layer)) continue;
      if (keep(item)) out.push({ layer, id: item.id });
    }
    return out;
  }

  /** How many shapes are shorter than `max` tiles, for the length slider. */
  shortCount(max: number): number {
    return this.matching((item) => lengthOf(item) < max).length;
  }

  /** Selects the shapes fully inside a box. With `additive`, they join the current selection. */
  selectInRect(rect: Rect, additive: boolean): void {
    this.choose(
      this.matching((item) => insideRect(item, rect)),
      additive,
    );
  }

  /** Selects every shape shorter than `max` tiles, replacing the selection. */
  selectShorterThan(max: number): void {
    this.choose(
      this.matching((item) => lengthOf(item) < max),
      false,
    );
  }

  private choose(found: readonly Target[], additive: boolean): void {
    const base = additive ? this.selectedShapes : [];
    const kept = base.filter((t) => !found.some((f) => sameTarget(f, t)));
    this.assignShapes([...kept, ...found]);
    this.emit();
  }

  /** Adds a shape to the selection, or takes it out when it is already selected. */
  toggleShape(target: Target): void {
    const list = this.selectedShapes;
    const at = list.findIndex((t) => sameTarget(t, target));
    this.assignShapes(
      at >= 0 ? list.filter((_, i) => i !== at) : [...list, target],
    );
    this.emit();
  }

  /** Points the primary selection at the last shape of `list`, and the rest at the others. */
  private assignShapes(list: readonly Target[]): void {
    this.labelSel = null;
    if (list.length === 0) {
      this.sel = null;
      this.extra = [];
    } else {
      const last = list[list.length - 1]!;
      this.sel = { layer: last.layer, id: last.id, index: null };
      this.extra = list.slice(0, -1);
    }
    this.settle();
  }

  /**
   * Picks what lies under a point, ignoring hidden and locked layers. The primary selection's
   * handles and anchors are the ones offered first.
   */
  pick(at: Pt, tol: number): Hit | null {
    let map = this.timeline.present;
    for (const layer of new Set([...this.hidden, ...this.locked])) {
      map = ops.replaceLayer(map, layer, []);
    }
    return hitTest(map, at, tol, this.sel ? toTarget(this.sel) : null);
  }

  /**
   * What a press on a label lands on: its corner (resize) or its body (move). Null when no label
   * is there. Labels are picked before shapes, since they are drawn over them.
   */
  pickLabel(at: Pt, tol: number): { id: string; grip: LabelGrip } | null {
    return pickLabel(this.timeline.present, at, tol);
  }

  /** Starts moving or resizing a label, and selects it. */
  beginLabelDrag(id: string, grip: LabelGrip, at: Pt): void {
    const base = this.timeline.present;
    const label = base.layers.labels.find((l) => l.id === id);
    if (!label) return;
    this.sel = null;
    this.extra = [];
    this.labelSel = id;
    let drag: Drag;
    if (grip === 'resize') {
      const corner = labelBox(label);
      const centre = { x: label.x, y: label.y };
      drag = {
        kind: 'labelSize',
        id,
        centre,
        startSize: label.size,
        startDist: Math.hypot(corner.x1 - centre.x, corner.y1 - centre.y),
      };
    } else {
      drag = {
        kind: 'label',
        id,
        offset: offsetBetween(at, { x: label.x, y: label.y }),
      };
    }
    this.gesture = { drag, base };
    this.draft = null;
    this.emit();
  }

  /** Places a new label at a point, with the kind chosen for labels, and selects it. */
  placeLabel(at: Pt): void {
    const id = ops.nextId(this.timeline.present, 'label');
    const pos = ops.snapPoint(at, this.step);
    const label: MapLabel = {
      id,
      kind: this.labelKind,
      text: LABEL_DEFAULT_TEXT[this.labelKind],
      x: pos.x,
      y: pos.y,
      size: LABEL_SIZE.default,
    };
    this.apply((m) => ops.addLabel(m, label));
    this.selectLabel(id);
  }

  /** Changes the selected label's text. Blank text is refused and leaves the label alone. */
  setLabelText(text: string): void {
    const id = this.labelSel;
    if (!id) return;
    this.apply((m) => ops.setLabel(m, id, { text }));
  }

  /** Changes the selected label's size in grid tiles. */
  setLabelSize(size: number): void {
    const id = this.labelSel;
    if (!id) return;
    this.apply((m) => ops.setLabel(m, id, { size }));
  }

  /** Sets the kind for new labels, and for the selected label when there is one. */
  setLabelKind(kind: MapLabel['kind']): void {
    this.labelKind = kind;
    const id = this.labelSel;
    if (!id) {
      this.emit();
      return;
    }
    this.apply((m) => ops.setLabel(m, id, { kind }));
  }

  /** Removes the selected label. */
  deleteSelectedLabel(): void {
    const id = this.labelSel;
    if (!id) return;
    this.apply((m) => ops.removeLabel(m, id));
  }

  /** Sets the base palette family the map is drawn with. Undoable like any other edit. */
  setPalette(paletteId: string): void {
    this.apply((m) => ops.setPalette(m, paletteId));
  }

  /** Sets the water choice the map is drawn with. Undoable like any other edit. */
  setWaterPalette(waterId: string): void {
    this.apply((m) => ops.setWaterPalette(m, waterId));
  }

  /** Sets which offers the map allows. Undoable like any other edit. */
  setAllowedOffers(options: readonly RestrictableOffer[]): void {
    this.apply((m) => ops.setAllowedOffers(m, options));
  }

  /** Removes every label, for pruning an import in one step. Undo restores them. */
  clearLabels(): void {
    this.apply((m) => ops.clearLabels(m));
  }

  beginDrag(hit: Hit, at: Pt): void {
    const base = this.timeline.present;
    const target: Target = { layer: hit.layer, id: hit.id };
    this.labelSel = null;
    let drag: Drag;
    if (hit.kind === 'point') {
      const pos = anchorOf(base, target, hit.index);
      if (!pos) return;
      this.extra = [];
      this.sel = { layer: target.layer, id: target.id, index: hit.index };
      drag = {
        kind: 'point',
        target,
        index: hit.index,
        offset: offsetBetween(at, pos),
      };
    } else if (hit.kind === 'handle') {
      const pos = handleOf(base, target, hit.index, hit.which);
      if (!pos) return;
      this.extra = [];
      this.sel = { layer: target.layer, id: target.id, index: hit.index };
      drag = {
        kind: 'handle',
        target,
        index: hit.index,
        which: hit.which,
        offset: offsetBetween(at, pos),
      };
    } else {
      // Edges and insides move the whole shape. Grabbing a shape already in the selection moves
      // all of them; grabbing any other shape selects it alone first.
      const group = this.selectedShapes;
      const targets = group.some((t) => sameTarget(t, target))
        ? group
        : [target];
      if (targets !== group) this.assignShapes([target]);
      else if (this.sel)
        this.sel = { layer: this.sel.layer, id: this.sel.id, index: null };
      drag = { kind: 'body', targets, start: at };
    }
    this.gesture = { drag, base };
    this.draft = null;
    this.emit();
  }

  /** The grid step for snapping, or 0 when snapping is off. */
  private get step(): number {
    return this.snapOn ? EDIT.snapStep : 0;
  }

  dragTo(at: Pt): void {
    if (!this.gesture) return;
    const current = this.draft ?? this.gesture.base;
    const next = applyDrag(this.gesture.base, this.gesture.drag, at, this.step);
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

  /** Removes every selected shape that is not locked. */
  deleteSelectedShapes(): void {
    const present = this.timeline.present;
    const targets = this.selectedShapes.filter((t) => !isLocked(present, t));
    if (targets.length === 0) return;
    this.apply((m) =>
      targets.reduce((acc, t) => ops.removeItem(acc, t.layer, t.id), m),
    );
    this.assignShapes([]);
    this.emit();
  }

  /** Locks or unlocks every selected shape. The lock is saved with the map. */
  setShapesLocked(locked: boolean): void {
    const targets = this.selectedShapes;
    if (targets.length === 0) return;
    this.apply((m) =>
      targets.reduce(
        (acc, t) => ops.setShapeLocked(acc, t.layer, t.id, locked),
        m,
      ),
    );
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
    this.extra = [];
    this.sel = { layer, id, index: after > before ? segment + 1 : null };
    this.settle();
    this.emit();
  }

  /** Turns every selected shape about the centre of the group. */
  rotateSelected(degrees: number): void {
    const targets = this.selectedShapes;
    const c = groupCentre(this.timeline.present, targets);
    if (!c) return;
    const radians = (degrees * Math.PI) / 180;
    this.apply((m) =>
      targets.reduce(
        (acc, t) => ops.rotateShape(acc, t.layer, t.id, c.x, c.y, radians),
        m,
      ),
    );
  }

  /** Scales every selected shape about the centre of the group. */
  scaleSelected(factor: number): void {
    const targets = this.selectedShapes;
    const c = groupCentre(this.timeline.present, targets);
    if (!c) return;
    this.apply((m) =>
      targets.reduce(
        (acc, t) => ops.scaleShape(acc, t.layer, t.id, c.x, c.y, factor),
        m,
      ),
    );
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

  setSnapping(on: boolean): void {
    if (on === this.snapOn) return;
    this.snapOn = on;
    this.emit();
  }

  /** Shows or hides a layer. Shapes in a hidden layer leave the selection. */
  toggleLayerVisible(layer: EditableLayer): void {
    if (this.hidden.has(layer)) {
      this.hidden.delete(layer);
    } else {
      this.hidden.add(layer);
      this.assignShapes(this.selectedShapes.filter((t) => t.layer !== layer));
    }
    this.emit();
  }

  /** Locks or unlocks a layer for picking. A locked layer can still be shown and hidden. */
  toggleLayerLocked(layer: EditableLayer): void {
    if (this.locked.has(layer)) this.locked.delete(layer);
    else this.locked.add(layer);
    this.emit();
  }

  /** Adds a point to the shape being painted, snapped to the grid when snapping is on. */
  addPaintPoint(at: Pt): void {
    if (this.toolState === 'select' || this.toolState === 'label') return;
    this.pending = [...this.pending, ops.snapPoint(at, this.step)];
    this.emit();
  }

  /** Makes the painted shape from the pending points and selects it; too few points make nothing. */
  finishPaint(): void {
    const tool = this.toolState;
    if (tool === 'select' || tool === 'label') return;
    const built = buildPainted(
      this.timeline.present,
      tool as PaintTool,
      this.pending,
      {
        riverWidth: this.river,
      },
    );
    this.pending = [];
    if (built) {
      this.apply((m) => ops.addItem(m, built.layer, built.item));
      this.extra = [];
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

  /** Keeps the selection valid after an undo, redo, edit or delete. */
  private settle(): void {
    const present = this.timeline.present;
    if (this.sel) {
      const item = findItem(present, this.sel);
      if (!item) {
        this.sel = null;
      } else if (
        this.sel.index !== null &&
        this.sel.index >= item.points.length
      ) {
        this.sel = { layer: this.sel.layer, id: this.sel.id, index: null };
      }
    }
    this.extra = this.extra.filter((t) => findItem(present, t) !== undefined);
    if (!this.sel && this.extra.length > 0) {
      const last = this.extra.pop()!;
      this.sel = { layer: last.layer, id: last.id, index: null };
    }
    if (
      this.labelSel !== null &&
      !present.layers.labels.some((l) => l.id === this.labelSel)
    ) {
      this.labelSel = null;
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function isLocked(map: SourceMap, target: Target): boolean {
  return findItem(map, target)?.locked === true;
}
