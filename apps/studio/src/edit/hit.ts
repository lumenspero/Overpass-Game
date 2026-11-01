import { sampleSpline } from '@overpass-game/map-compiler';
import type { SourceMap } from '@overpass-game/map-schema';
import type { EditableLayer } from './ops.ts';

/** A point in source-map grid units: x east, y south, origin at the top-left corner. */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

export interface Target {
  readonly layer: EditableLayer;
  readonly id: string;
}

/** What the pointer found. Every hit names its shape. */
export type Hit =
  | (Target & { readonly kind: 'point'; readonly index: number })
  | (Target & {
      readonly kind: 'handle';
      readonly index: number;
      readonly which: 'handleIn' | 'handleOut';
    })
  | (Target & { readonly kind: 'edge'; readonly segment: number })
  | (Target & { readonly kind: 'body' });

/** The parts of a shape the hit tests read. Polylines have no kind and no handles. */
export interface EditItem {
  readonly id: string;
  readonly kind?: 'closedSpline' | 'strokeSpline';
  points: {
    x: number;
    y: number;
    handleIn?: { x: number; y: number };
    handleOut?: { x: number; y: number };
  }[];
}

export interface Listed {
  readonly layer: EditableLayer;
  readonly item: EditItem;
}

const LAYERS: readonly EditableLayer[] = [
  'water',
  'mountains',
  'parks',
  'spawnZones',
  'motorwayGuide',
  'starterRoads',
];

/** Every shape and polyline in the map, in layer order, then list order. */
export function listItems(map: SourceMap): Listed[] {
  const out: Listed[] = [];
  for (const layer of LAYERS) {
    for (const item of map.layers[layer] as unknown as EditItem[]) {
      out.push({ layer, item });
    }
  }
  return out;
}

export function findItem(map: SourceMap, target: Target): EditItem | undefined {
  return listItems(map).find(
    (l) => l.layer === target.layer && l.item.id === target.id,
  )?.item;
}

export function anchorOf(
  map: SourceMap,
  target: Target,
  index: number,
): Pt | null {
  const item = findItem(map, target);
  const p = item?.points[index];
  return p ? { x: p.x, y: p.y } : null;
}

export function handleOf(
  map: SourceMap,
  target: Target,
  index: number,
  which: 'handleIn' | 'handleOut',
): Pt | null {
  const p = findItem(map, target)?.points[index];
  const off = p?.[which];
  return p && off ? { x: p.x + off.x, y: p.y + off.y } : null;
}

/** The middle of an item's anchors' bounding box, or null when it is missing. */
export function centreOf(map: SourceMap, target: Target): Pt | null {
  const item = findItem(map, target);
  if (!item || item.points.length === 0) return null;
  const xs = item.points.map((p) => p.x);
  const ys = item.points.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Closest sampled edge to p, with the index of the anchor segment it belongs to. */
function nearestEdge(
  item: EditItem,
  p: Pt,
): { d: number; segment: number } | null {
  const closed = item.kind === 'closedSpline';
  const s = sampleSpline(item.points, closed);
  if (s.length < 2) return null;
  const segs = closed ? item.points.length : item.points.length - 1;
  const per = closed ? s.length / segs : (s.length - 1) / segs;
  const count = closed ? s.length : s.length - 1;
  let best: { d: number; segment: number } | null = null;
  for (let j = 0; j < count; j++) {
    const a = s[j]!;
    const b = s[(j + 1) % s.length]!;
    const d = distToSegment(p, a, b);
    if (!best || d < best.d) {
      best = { d, segment: Math.min(Math.floor(j / per), segs - 1) };
    }
  }
  return best;
}

/** Even-odd test: true when p is inside the closed ring. */
function insideRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * What lies under p, in grid units, within `tol` grid units. Priority: handles of the
 * selected shape, then anchors, then edges, then the inside of a closed shape. The selected
 * shape wins ties at every level. Returns null when nothing is close.
 */
export function hitTest(
  map: SourceMap,
  p: Pt,
  tol: number,
  selected: Target | null,
): Hit | null {
  const listed = listItems(map);
  const sel = selected
    ? listed.find(
        (l) => l.layer === selected.layer && l.item.id === selected.id,
      )
    : undefined;
  const ordered = sel ? [sel, ...listed.filter((l) => l !== sel)] : listed;

  if (sel) {
    const { layer, item } = sel;
    for (let i = 0; i < item.points.length; i++) {
      const pt = item.points[i]!;
      for (const which of ['handleIn', 'handleOut'] as const) {
        const off = pt[which];
        if (off && dist(p, { x: pt.x + off.x, y: pt.y + off.y }) <= tol) {
          return { kind: 'handle', layer, id: item.id, index: i, which };
        }
      }
    }
  }

  for (const { layer, item } of ordered) {
    for (let i = 0; i < item.points.length; i++) {
      if (dist(p, item.points[i]!) <= tol) {
        return { kind: 'point', layer, id: item.id, index: i };
      }
    }
  }

  let edge: {
    d: number;
    layer: EditableLayer;
    id: string;
    segment: number;
  } | null = null;
  for (const { layer, item } of ordered) {
    const near = nearestEdge(item, p);
    if (near && near.d <= tol && (!edge || near.d < edge.d)) {
      edge = { d: near.d, layer, id: item.id, segment: near.segment };
    }
  }
  if (edge) {
    return {
      kind: 'edge',
      layer: edge.layer,
      id: edge.id,
      segment: edge.segment,
    };
  }

  // Later shapes are drawn on top, so they are tested first; the selected one goes first.
  const topmost = [...listed].reverse();
  const bodies = sel ? [sel, ...topmost.filter((l) => l !== sel)] : topmost;
  for (const { layer, item } of bodies) {
    if (item.kind !== 'closedSpline') continue;
    if (insideRing(p, sampleSpline(item.points, true))) {
      return { kind: 'body', layer, id: item.id };
    }
  }
  return null;
}
