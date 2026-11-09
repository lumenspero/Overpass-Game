import type { Polyline, Shape, SourceMap } from '@overpass-game/map-schema';
import type { Pt } from './hit.ts';
import { nextId, type EditableLayer } from './ops.ts';

/** The tools that make a new shape. `select` edits existing shapes instead. */
export type PaintTool =
  'lake' | 'river' | 'mountain' | 'park' | 'guide' | 'road';

/**
 * The tool in use. `select` edits shapes and labels, `label` places and moves text labels,
 * `fence` moves and resizes the starting fence, and the paint tools make new shapes. Only the
 * paint tools have a PaintSpec.
 */
export type Tool = 'select' | 'label' | 'fence' | PaintTool;

/** True for the tools that make a new shape point by point. */
export function isPaintTool(tool: Tool): tool is PaintTool {
  return tool !== 'select' && tool !== 'label' && tool !== 'fence';
}

/**
 * How a painted shape is stored: a closed region, a stroke with a width (rivers), or an open
 * polyline with no handles (motorway guide and starter roads).
 */
export type Form = 'closed' | 'stroke' | 'line';

export interface PaintSpec {
  readonly label: string;
  readonly layer: EditableLayer;
  readonly prefix: string;
  readonly form: Form;
}

export const PAINT_SPECS: Record<PaintTool, PaintSpec> = {
  lake: { label: 'Lake', layer: 'water', prefix: 'lake', form: 'closed' },
  river: { label: 'River', layer: 'water', prefix: 'river', form: 'stroke' },
  mountain: {
    label: 'Mountain',
    layer: 'mountains',
    prefix: 'mountain',
    form: 'closed',
  },
  park: { label: 'Park', layer: 'parks', prefix: 'park', form: 'closed' },
  guide: {
    label: 'Motorway guide',
    layer: 'motorwayGuide',
    prefix: 'motorway',
    form: 'line',
  },
  road: {
    label: 'Starter road',
    layer: 'starterRoads',
    prefix: 'road',
    form: 'line',
  },
};

export const PAINT_TOOLS = Object.keys(PAINT_SPECS) as PaintTool[];

export interface PaintOptions {
  /** Width in tiles for a new river. */
  readonly riverWidth: number;
}

const same = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

/** Drops a point that repeats the one before it. A double-click adds its point twice. */
export function dedupe(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || !same(last, p)) out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * Builds the shape a paint tool makes from the points clicked so far, with a fresh id.
 * A closed shape drops a last point that closes back onto the first. Returns null when too
 * few points remain: 3 for a closed shape, 2 for a stroke or a line.
 */
export function buildPainted(
  map: SourceMap,
  tool: PaintTool,
  raw: readonly Pt[],
  opts: PaintOptions,
): { layer: EditableLayer; item: Shape | Polyline } | null {
  const spec = PAINT_SPECS[tool];
  let pts = dedupe(raw);
  if (
    spec.form === 'closed' &&
    pts.length > 1 &&
    same(pts[0]!, pts[pts.length - 1]!)
  ) {
    pts = pts.slice(0, -1);
  }
  const least = spec.form === 'closed' ? 3 : 2;
  if (pts.length < least) return null;

  const id = nextId(map, spec.prefix);
  const points = pts.map((p) => ({ x: p.x, y: p.y }));
  const layer = spec.layer;

  if (tool === 'river') {
    const item: Shape = {
      id,
      kind: 'strokeSpline',
      origin: 'painted',
      width: opts.riverWidth,
      points,
    };
    return { layer, item };
  }
  if (spec.form === 'line') {
    const item: Polyline = { id, points };
    return { layer, item };
  }
  const item: Shape = { id, kind: 'closedSpline', origin: 'painted', points };
  return { layer, item };
}
