import type { MapLabel, SourceMap } from '@overpass-game/map-schema';

/**
 * Immutable edits to a source map. Each operation returns the same map object when nothing
 * changes (an unknown id, a locked shape, a refused point delete), so the history records no
 * empty step. Handles are offsets from their point, so moving a point carries its handles.
 */

/// Shape layers only. Labels are points and get their own editing tool.
export type EditableLayer = Exclude<keyof SourceMap['layers'], 'labels'>;
type Layers = SourceMap['layers'];
type Item = Layers[EditableLayer][number];

interface Vec {
  x: number;
  y: number;
}
interface PointLike extends Vec {
  handleIn?: Vec;
  handleOut?: Vec;
}
interface ItemLike {
  id: string;
  points: PointLike[];
  kind?: 'closedSpline' | 'strokeSpline';
  locked?: boolean;
}

/** Polylines (motorway guide, starter roads) have no handles and are never closed. */
const POLYLINE_LAYERS: ReadonlySet<EditableLayer> = new Set([
  'motorwayGuide',
  'starterRoads',
]);

export function snapValue(value: number, step: number): number {
  if (!(step > 0)) return value;
  const snapped = Math.round(value / step) * step;
  return Object.is(snapped, -0) ? 0 : snapped;
}

export function snapPoint(p: Vec, step: number): Vec {
  return { x: snapValue(p.x, step), y: snapValue(p.y, step) };
}

function isClosed(item: ItemLike): boolean {
  return item.kind === 'closedSpline';
}

/** The fewest points a shape can keep: a closed region needs 3, anything else 2. */
function minPoints(item: ItemLike): number {
  return isClosed(item) ? 3 : 2;
}

function hasHandles(item: ItemLike): boolean {
  return item.points.some(
    (p) => p.handleIn !== undefined || p.handleOut !== undefined,
  );
}

/**
 * Applies `edit` to one item in one layer. Unknown ids and locked shapes return the map
 * unchanged. `edit` returns null to refuse the change.
 */
function updateItem(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
  edit: (item: Item) => Item | null,
): SourceMap {
  const list = map.layers[layer] as Item[];
  const index = list.findIndex((it) => it.id === id);
  if (index < 0) return map;
  const current = list[index] as Item;
  if ((current as ItemLike).locked) return map;
  const next = edit(current);
  if (next === null || next === current) return map;
  const copy = list.slice();
  copy[index] = next;
  return { ...map, layers: { ...map.layers, [layer]: copy } as Layers };
}

function mapPoints(
  item: Item,
  fn: (p: PointLike, i: number) => PointLike,
): Item {
  const points = (item as unknown as ItemLike).points.map(fn);
  return { ...item, points } as Item;
}

export function movePoint(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
  index: number,
  to: Vec,
  snapStep: number,
): SourceMap {
  const target = snapPoint(to, snapStep);
  return updateItem(map, layer, id, (item) => {
    const points = (item as unknown as ItemLike).points;
    if (index < 0 || index >= points.length) return null;
    return mapPoints(item, (p, i) => (i === index ? { ...p, ...target } : p));
  });
}

/** Moves one handle to an absolute position. The stored handle is the offset from its point. */
export function moveHandle(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
  index: number,
  which: 'handleIn' | 'handleOut',
  to: Vec,
  snapStep: number,
): SourceMap {
  const target = snapPoint(to, snapStep);
  return updateItem(map, layer, id, (item) => {
    const points = (item as unknown as ItemLike).points;
    if (index < 0 || index >= points.length) return null;
    return mapPoints(item, (p, i) => {
      if (i !== index) return p;
      return { ...p, [which]: { x: target.x - p.x, y: target.y - p.y } };
    });
  });
}

interface SplitResult {
  mid: PointLike;
  aOut: Vec | undefined;
  bIn: Vec | undefined;
}

const mid = (a: Vec, b: Vec): Vec => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/**
 * Splits the segment a→b at its midpoint. A curved segment is split with de Casteljau's
 * algorithm, so the shape keeps its exact curve; a straight one just gets a midpoint.
 */
function splitSegment(
  a: PointLike,
  b: PointLike,
  curved: boolean,
): SplitResult {
  if (!curved) {
    return { mid: { ...mid(a, b) }, aOut: a.handleOut, bIn: b.handleIn };
  }
  const p0 = { x: a.x, y: a.y };
  const p1 = a.handleOut
    ? { x: a.x + a.handleOut.x, y: a.y + a.handleOut.y }
    : p0;
  const p3 = { x: b.x, y: b.y };
  const p2 = b.handleIn ? { x: b.x + b.handleIn.x, y: b.y + b.handleIn.y } : p3;
  const m1 = mid(p0, p1);
  const m2 = mid(p1, p2);
  const m3 = mid(p2, p3);
  const q1 = mid(m1, m2);
  const q2 = mid(m2, m3);
  const m = mid(q1, q2);
  return {
    mid: {
      x: m.x,
      y: m.y,
      handleIn: { x: q1.x - m.x, y: q1.y - m.y },
      handleOut: { x: q2.x - m.x, y: q2.y - m.y },
    },
    aOut: { x: m1.x - a.x, y: m1.y - a.y },
    bIn: { x: m3.x - b.x, y: m3.y - b.y },
  };
}

/** Inserts a point in the middle of segment `segment` (from point `segment` to the next). */
export function insertPoint(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
  segment: number,
): SourceMap {
  return updateItem(map, layer, id, (item) => {
    const base = item as unknown as ItemLike;
    const n = base.points.length;
    const closed = isClosed(base);
    const segments = closed ? n : n - 1;
    if (segment < 0 || segment >= segments) return null;
    const next = (segment + 1) % n;
    const split = splitSegment(
      base.points[segment] as PointLike,
      base.points[next] as PointLike,
      !POLYLINE_LAYERS.has(layer) && hasHandles(base),
    );
    const points = base.points.map((p) => ({ ...p }));
    points[segment] = {
      ...points[segment],
      handleOut: split.aOut,
    } as PointLike;
    points[next] = { ...points[next], handleIn: split.bIn } as PointLike;
    points.splice(segment + 1, 0, split.mid);
    return { ...item, points } as Item;
  });
}

/** Removes a point. Refused when the shape would drop below its minimum. */
export function deletePoint(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
  index: number,
): SourceMap {
  return updateItem(map, layer, id, (item) => {
    const base = item as unknown as ItemLike;
    if (index < 0 || index >= base.points.length) return null;
    if (base.points.length - 1 < minPoints(base)) return null;
    const points = base.points.filter((_, i) => i !== index);
    return { ...item, points } as Item;
  });
}

/** Moves a whole shape by (dx, dy) tiles. */
export function translateShape(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
  dx: number,
  dy: number,
): SourceMap {
  return updateItem(map, layer, id, (item) =>
    mapPoints(item, (p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  );
}

/** Scales a whole shape about (cx, cy). Handle offsets scale with it. Stroke widths stay put. */
export function scaleShape(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
  cx: number,
  cy: number,
  factor: number,
): SourceMap {
  if (!(factor > 0)) return map;
  return updateItem(map, layer, id, (item) =>
    mapPoints(item, (p) => {
      const out: PointLike = {
        x: cx + (p.x - cx) * factor,
        y: cy + (p.y - cy) * factor,
      };
      if (p.handleIn)
        out.handleIn = { x: p.handleIn.x * factor, y: p.handleIn.y * factor };
      if (p.handleOut)
        out.handleOut = {
          x: p.handleOut.x * factor,
          y: p.handleOut.y * factor,
        };
      return out;
    }),
  );
}

/** Rotates a whole shape about (cx, cy) by `radians`, counter-clockwise on screen. Handles turn with it. */
export function rotateShape(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
  cx: number,
  cy: number,
  radians: number,
): SourceMap {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const turn = (x: number, y: number): Vec => ({
    x: x * c - y * s,
    y: x * s + y * c,
  });
  return updateItem(map, layer, id, (item) =>
    mapPoints(item, (p) => {
      const r = turn(p.x - cx, p.y - cy);
      const out: PointLike = { x: cx + r.x, y: cy + r.y };
      if (p.handleIn) out.handleIn = turn(p.handleIn.x, p.handleIn.y);
      if (p.handleOut) out.handleOut = turn(p.handleOut.x, p.handleOut.y);
      return out;
    }),
  );
}

export function setShapeLocked(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
  locked: boolean,
): SourceMap {
  // A lock can always be changed, even on a locked shape, so this bypasses updateItem.
  const list = map.layers[layer] as Item[];
  const index = list.findIndex((it) => it.id === id);
  if (index < 0) return map;
  const current = list[index] as Item;
  if (Boolean((current as ItemLike).locked) === locked) return map;
  const copy = list.slice();
  copy[index] = { ...current, locked } as Item;
  return { ...map, layers: { ...map.layers, [layer]: copy } as Layers };
}

/** Appends an item. An id already in use anywhere in the map is refused. */
export function addItem(
  map: SourceMap,
  layer: EditableLayer,
  item: Item,
): SourceMap {
  if (allIds(map).has(item.id)) return map;
  const list = map.layers[layer] as Item[];
  return {
    ...map,
    layers: { ...map.layers, [layer]: [...list, item] } as Layers,
  };
}

export function removeItem(
  map: SourceMap,
  layer: EditableLayer,
  id: string,
): SourceMap {
  const list = map.layers[layer] as Item[];
  const kept = list.filter((it) => it.id !== id);
  if (kept.length === list.length) return map;
  return { ...map, layers: { ...map.layers, [layer]: kept } as Layers };
}

export function allIds(map: SourceMap): Set<string> {
  const ids = new Set<string>();
  for (const list of Object.values(map.layers)) {
    for (const item of list as { id: string }[]) ids.add(item.id);
  }
  return ids;
}

/** The next free id with this prefix: `prefix-1`, `prefix-2`, and so on. */
export function nextId(map: SourceMap, prefix: string): string {
  const taken = allIds(map);
  for (let n = 1; ; n++) {
    const candidate = `${prefix}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Sets the base palette family the preview and the game draw the map with. */
export function setPalette(map: SourceMap, paletteId: string): SourceMap {
  if (map.palette === paletteId) return map;
  return { ...map, palette: paletteId };
}

/** Sets the water choice: the shared ramp, or a family's hue for the water. */
export function setWaterPalette(map: SourceMap, waterId: string): SourceMap {
  if (map.waterPalette === waterId) return map;
  return { ...map, waterPalette: waterId };
}

/** Removes every label. Undo brings them back, so a bulk prune is safe to try. */
export function clearLabels(map: SourceMap): SourceMap {
  if (map.layers.labels.length === 0) return map;
  return { ...map, layers: { ...map.layers, labels: [] } };
}

/** Appends a label. An id already in use anywhere in the map is refused. */
export function addLabel(map: SourceMap, label: MapLabel): SourceMap {
  if (allIds(map).has(label.id)) return map;
  return {
    ...map,
    layers: { ...map.layers, labels: [...map.layers.labels, label] },
  };
}

/** Replaces one label with an edited copy. Returns the same map when the label is missing or unchanged. */
function updateLabel(
  map: SourceMap,
  id: string,
  change: (label: MapLabel) => MapLabel,
): SourceMap {
  const list = map.layers.labels;
  const at = list.findIndex((l) => l.id === id);
  if (at < 0) return map;
  const current = list[at]!;
  const next = change(current);
  if (next === current) return map;
  const copy = list.slice();
  copy[at] = next;
  return { ...map, layers: { ...map.layers, labels: copy } };
}

/** Moves a label. Its position is in grid units, the same as shape points. */
export function moveLabel(
  map: SourceMap,
  id: string,
  x: number,
  y: number,
): SourceMap {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return map;
  return updateLabel(map, id, (l) =>
    l.x === x && l.y === y ? l : { ...l, x, y },
  );
}

export interface LabelPatch {
  readonly text?: string;
  readonly kind?: MapLabel['kind'];
  readonly size?: number;
}

/** Limits from the map schema, so an edit can never write a label the compiler would reject. */
export const LABEL_TEXT_MAX = 40;
export const LABEL_SIZE_MIN = 1;
export const LABEL_SIZE_MAX = 20;

/**
 * Changes a label's text, kind or size. Text is trimmed and cut to the schema's length; blank
 * text and a non-finite size are refused, leaving the label as it was.
 */
export function setLabel(
  map: SourceMap,
  id: string,
  patch: LabelPatch,
): SourceMap {
  return updateLabel(map, id, (l) => {
    const text =
      patch.text === undefined
        ? l.text
        : patch.text.trim().slice(0, LABEL_TEXT_MAX);
    if (text.length === 0) return l;
    const size =
      patch.size === undefined
        ? l.size
        : Number.isFinite(patch.size)
          ? Math.min(LABEL_SIZE_MAX, Math.max(LABEL_SIZE_MIN, patch.size))
          : NaN;
    if (Number.isNaN(size)) return l;
    const kind = patch.kind ?? l.kind;
    if (text === l.text && size === l.size && kind === l.kind) return l;
    return { ...l, text, size, kind };
  });
}

/** Removes a label. */
export function removeLabel(map: SourceMap, id: string): SourceMap {
  const list = map.layers.labels;
  const kept = list.filter((l) => l.id !== id);
  if (kept.length === list.length) return map;
  return { ...map, layers: { ...map.layers, labels: kept } };
}

/** Replaces every item in a layer, for example when the mountain slider rebuilds the mountains. */
export function replaceLayer(
  map: SourceMap,
  layer: EditableLayer,
  items: readonly Layers[EditableLayer][number][],
): SourceMap {
  return {
    ...map,
    layers: { ...map.layers, [layer]: items.slice() } as Layers,
  };
}
