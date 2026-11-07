import type {
  CompiledMap,
  OutlinePath,
  Shape,
  SourceMap,
} from '@overpass-game/map-schema';
import {
  type Grid,
  type MapRule,
  Terrain,
  type TerrainKind,
} from '@overpass-game/sim';

export const PACKAGE_NAME = '@overpass-game/map-compiler' as const;

/**
 * Tessellation and precision. These only shape the drawn and stored geometry, so they are not
 * gameplay numbers and do not belong in config.ts.
 */
/** The most samples along one spline segment. Short segments take fewer: one per SAMPLE_STEP. */
const SAMPLES_PER_SEGMENT = 16;
/** Grid tiles between samples along a spline segment. */
const SAMPLE_STEP = 0.25;
/** The fewest samples along one segment, so a curve between two close points still bends. */
const MIN_SAMPLES = 2;
const PATH_STEP = 0.05; // grid tiles between samples when walking a guide or starter road
const DECIMALS = 100; // outline points are kept to 0.01 tile

type Pt = { x: number; y: number };
type SplinePoint = Shape['points'][number];

/** The shape of a region or a stroke, as the compiler reads it. */
type Geometry = Pick<Shape, 'kind' | 'points' | 'width'>;

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Samples a spline into points. Each segment is a cubic Bézier; a missing handle is the point
 * itself, so a point pair with no handles is a straight line. A closed spline joins its last
 * point back to its first and returns no duplicate end point.
 */
export function sampleSpline(points: SplinePoint[], closed: boolean): Pt[] {
  const out: Pt[] = [];
  const n = points.length;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const p0 = { x: a.x, y: a.y };
    const p1 = a.handleOut
      ? { x: a.x + a.handleOut.x, y: a.y + a.handleOut.y }
      : p0;
    const p2 = b.handleIn
      ? { x: b.x + b.handleIn.x, y: b.y + b.handleIn.y }
      : { x: b.x, y: b.y };
    const p3 = { x: b.x, y: b.y };
    // The control polygon's length bounds the curve's, so it sets how many samples it needs.
    const reach =
      Math.hypot(p1.x - p0.x, p1.y - p0.y) +
      Math.hypot(p2.x - p1.x, p2.y - p1.y) +
      Math.hypot(p3.x - p2.x, p3.y - p2.y);
    const samples = Math.min(
      SAMPLES_PER_SEGMENT,
      Math.max(MIN_SAMPLES, Math.ceil(reach / SAMPLE_STEP)),
    );
    for (let s = 0; s < samples; s++) {
      out.push(cubic(p0, p1, p2, p3, s / samples));
    }
  }
  if (!closed) {
    const last = points[n - 1];
    out.push({ x: last.x, y: last.y });
  }
  return out;
}

/** Even-odd test: true when (px, py) is inside the closed ring. */
function insideRing(px: number, py: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.y > py !== b.y > py &&
      px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The bounding box of a list of points, found with a loop. Spreading a long list into Math.min or
 * Math.max overflows the call stack once a shape has a few hundred thousand points.
 */
function boundsOf(pts: readonly Pt[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/** Tiles whose centre lies inside the ring. A tile belongs to a region when its centre is inside. */
function ringTiles(ring: Pt[], cols: number, rows: number): number[] {
  const b = boundsOf(ring);
  const x0 = Math.max(0, Math.floor(b.minX));
  const x1 = Math.min(cols - 1, Math.floor(b.maxX));
  const y0 = Math.max(0, Math.floor(b.minY));
  const y1 = Math.min(rows - 1, Math.floor(b.maxY));
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (insideRing(x + 0.5, y + 0.5, ring)) out.push(y * cols + x);
    }
  }
  return out;
}

/** Samples per tile along a stroke when walking it, so no tile it passes through is skipped. */
const STROKE_SAMPLES_PER_TILE = 10;

/**
 * Tiles whose centre is within half the stroke width of the line, plus every tile the line passes
 * through. Thin strokes would otherwise break into ragged runs with gaps at joins and ends; with the
 * walk, a stroke is one unbroken run of tiles, so it reads the same whatever its width.
 */
function strokeTiles(
  line: Pt[],
  width: number,
  cols: number,
  rows: number,
): number[] {
  const r = width / 2;
  const b = boundsOf(line);
  const x0 = Math.max(0, Math.floor(b.minX - r));
  const x1 = Math.min(cols - 1, Math.floor(b.maxX + r));
  const y0 = Math.max(0, Math.floor(b.minY - r));
  const y1 = Math.min(rows - 1, Math.floor(b.maxY + r));
  const covered = new Set<number>();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = { x: x + 0.5, y: y + 0.5 };
      let near = false;
      for (let i = 0; i < line.length - 1 && !near; i++) {
        near = distanceToSegment(c, line[i], line[i + 1]) <= r;
      }
      if (near) covered.add(y * cols + x);
    }
  }
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const z = line[i + 1];
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(z.x - a.x, z.y - a.y) * STROKE_SAMPLES_PER_TILE),
    );
    for (let s = 0; s <= steps; s++) {
      const px = Math.floor(a.x + ((z.x - a.x) * s) / steps);
      const py = Math.floor(a.y + ((z.y - a.y) * s) / steps);
      if (px >= 0 && py >= 0 && px < cols && py < rows) {
        covered.add(py * cols + px);
      }
    }
  }
  return [...covered].sort((p, q) => p - q);
}

/** The tiles a shape covers. A closed shape covers its inside; a stroke covers its width. */
export function shapeTiles(
  shape: Geometry,
  cols: number,
  rows: number,
): number[] {
  if (shape.kind === 'closedSpline') {
    return ringTiles(sampleSpline(shape.points, true), cols, rows);
  }
  if (shape.width === undefined) {
    throw new Error('a stroke needs a width');
  }
  return strokeTiles(
    sampleSpline(shape.points, false),
    shape.width,
    cols,
    rows,
  );
}

/**
 * Walks a polyline and returns the tile runs it passes through, in order. Each run is a
 * list of tile indices, 8-adjacent to the next. A run ends where the line leaves the grid, so
 * a guide that runs off the map becomes separate pieces.
 */
export function tilePaths(
  points: Pt[],
  cols: number,
  rows: number,
): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  const flush = (): void => {
    if (run.length >= 2) runs.push(run);
    run = [];
  };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / PATH_STEP),
    );
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const y = a.y + ((b.y - a.y) * s) / steps;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) {
        flush();
        continue;
      }
      const t = ty * cols + tx;
      if (run[run.length - 1] !== t) run.push(t);
    }
  }
  flush();
  return runs;
}

const round = (v: number): number => Math.round(v * DECIMALS) / DECIMALS;

/**
 * Clips the segment a-b to the rectangle [0, w] x [0, h] (Liang-Barsky). Returns the clipped
 * segment, or null when none of it is inside.
 */
function clipSegment(a: Pt, b: Pt, w: number, h: number): [Pt, Pt] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x],
    [dx, w - a.x],
    [-dy, a.y],
    [dy, h - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

/**
 * The parts of a polyline inside the grid, as drawn points in grid units. Only the original
 * corners and the points where the line crosses the grid edge are kept, so a straight guide is
 * two points however long it is. Used for the motorway guide, which is drawn smooth.
 * Each run is at least two points.
 */
export function clipPolyline(points: Pt[], cols: number, rows: number): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  const flush = (): void => {
    if (run.length >= 2) runs.push(run);
    run = [];
  };
  for (let i = 0; i < points.length - 1; i++) {
    const seg = clipSegment(points[i], points[i + 1], cols, rows);
    if (!seg) {
      flush();
      continue;
    }
    const [p, q] = seg;
    const last = run[run.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) {
      flush();
      run.push(p);
    }
    run.push(q);
  }
  flush();
  return runs.map((r) => r.map((v) => ({ x: round(v.x), y: round(v.y) })));
}

function outlineOf(shape: Shape): OutlinePath {
  const closed = shape.kind === 'closedSpline';
  const points = sampleSpline(shape.points, closed).map((p) => ({
    x: round(p.x),
    y: round(p.y),
  }));
  return closed ? { closed, points } : { closed, width: shape.width, points };
}

/**
 * FNV-1a, 32-bit, as eight hex digits. Used to tell whether a map changed since a save was
 * made, not for security, so a 32-bit hash is enough.
 */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compiles a validated source map into the compiled map the game loads.
 *
 * Terrain is painted in layers, later layers winning: parks, then mountains, then water.
 */
export function compileMap(source: SourceMap): CompiledMap {
  // Shapes are trimmed to the map first, so a source made before trimming compiles the same way.
  const src = trimSource(source);
  const { cols, rows } = src.grid;
  const n = cols * rows;
  const terrain: TerrainKind[] = new Array<TerrainKind>(n).fill(Terrain.Land);
  const paint = (shape: Geometry, kind: TerrainKind): void => {
    for (const t of shapeTiles(shape, cols, rows)) terrain[t] = kind;
  };
  for (const s of src.layers.parks) paint(s, Terrain.Park);
  for (const s of src.layers.mountains) paint(s, Terrain.Mountain);
  for (const s of src.layers.water) paint(s, Terrain.Water);

  const body = {
    schemaVersion: src.schemaVersion,
    id: src.id,
    name: src.name,
    cols,
    rows,
    terrain,
    fence: { ...src.grid.fence },
    outlines: {
      water: src.layers.water.map(outlineOf),
      mountains: src.layers.mountains.map(outlineOf),
      parks: src.layers.parks.map(outlineOf),
    },
    motorwayGuide: src.layers.motorwayGuide.flatMap((l) =>
      clipPolyline(l.points, cols, rows),
    ),
    starterRoads: src.layers.starterRoads.flatMap((l) =>
      tilePaths(l.points, cols, rows),
    ),
    labels: src.layers.labels,
    rules: src.rules,
    palette: src.palette,
    waterPalette: src.waterPalette,
    attribution: src.attribution,
  };
  return { ...body, contentHash: contentHash(JSON.stringify(body)) };
}

/**
 * Tiles beyond the grid that trimmed shapes keep. Cut edges fall here, under the fill outside the
 * grid, and no handle reaches far enough to pull a curve back into view.
 */
export const TRIM_MARGIN = 4;

type SplinePt = Shape['points'][number];
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const round2 = (v: number): number => Math.round(v * DECIMALS) / DECIMALS;

function roundPoint(p: SplinePt): SplinePt {
  const out: SplinePt = { x: round2(p.x), y: round2(p.y) };
  if (p.handleIn) {
    out.handleIn = { x: round2(p.handleIn.x), y: round2(p.handleIn.y) };
  }
  if (p.handleOut) {
    out.handleOut = { x: round2(p.handleOut.x), y: round2(p.handleOut.y) };
  }
  return out;
}

function inBox(p: Pt, b: Box): boolean {
  return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
}

/** Drops a point that repeats the one before it, and for a ring, a last point that repeats the first. */
function dedupe(pts: SplinePt[], closed: boolean): SplinePt[] {
  const out: SplinePt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    closed &&
    out.length > 1 &&
    first &&
    last &&
    first.x === last.x &&
    first.y === last.y
  ) {
    out.pop();
  }
  return out;
}

/**
 * Clips a closed shape's points to the box, one side at a time (Sutherland-Hodgman). Kept points keep
 * their handles; points made on the box edge have none, so the cut runs straight along the margin.
 */
function clipRing(points: SplinePt[], b: Box): SplinePt[] {
  const at = (a: Pt, c: Pt, t: number): SplinePt => ({
    x: a.x + (c.x - a.x) * t,
    y: a.y + (c.y - a.y) * t,
  });
  const sides: {
    inside: (p: Pt) => boolean;
    cut: (a: Pt, c: Pt) => SplinePt;
  }[] = [
    {
      inside: (p) => p.x >= b.x0,
      cut: (a, c) => at(a, c, (b.x0 - a.x) / (c.x - a.x)),
    },
    {
      inside: (p) => p.x <= b.x1,
      cut: (a, c) => at(a, c, (b.x1 - a.x) / (c.x - a.x)),
    },
    {
      inside: (p) => p.y >= b.y0,
      cut: (a, c) => at(a, c, (b.y0 - a.y) / (c.y - a.y)),
    },
    {
      inside: (p) => p.y <= b.y1,
      cut: (a, c) => at(a, c, (b.y1 - a.y) / (c.y - a.y)),
    },
  ];
  let poly = points;
  for (const side of sides) {
    const out: SplinePt[] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      if (!cur || !prev) continue;
      const curIn = side.inside(cur);
      const prevIn = side.inside(prev);
      if (curIn) {
        if (!prevIn) out.push(side.cut(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(side.cut(prev, cur));
      }
    }
    poly = out;
    if (poly.length === 0) break;
  }
  return poly;
}

/**
 * One shape trimmed to the box. A closed shape is clipped; a stroke keeps each run of points that
 * comes within the box, one point past it on either side, as its own stroke. Nothing left: no shape.
 */
function trimShape(shape: Shape, b: Box): Shape[] {
  if (shape.points.every((p) => inBox(p, b))) {
    return [
      {
        ...shape,
        points: dedupe(
          shape.points.map(roundPoint),
          shape.kind === 'closedSpline',
        ),
      },
    ];
  }
  if (shape.kind === 'closedSpline') {
    const points = dedupe(clipRing(shape.points, b).map(roundPoint), true);
    return points.length >= 3 ? [{ ...shape, points }] : [];
  }
  const pts = shape.points;
  const near = pts.map((p, i) => {
    const before = pts[i - 1];
    const after = pts[i + 1];
    return (
      inBox(p, b) ||
      (before !== undefined && inBox(before, b)) ||
      (after !== undefined && inBox(after, b))
    );
  });
  const runs: SplinePt[][] = [];
  let run: SplinePt[] = [];
  pts.forEach((p, i) => {
    if (near[i]) run.push(p);
    else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length > 0) runs.push(run);
  return runs
    .map((r) => dedupe(r.map(roundPoint), false))
    .filter((r) => r.length >= 2)
    .map((r, k) => ({
      ...shape,
      id: k === 0 ? shape.id : `${shape.id}~${k}`,
      points: r,
    }));
}

/**
 * The map's water, mountain and park shapes trimmed to the grid plus TRIM_MARGIN, with every
 * coordinate rounded to 0.01 tile. Imported shapes often run far past the map; this keeps only
 * what can be seen or played. Trimming a trimmed map changes nothing.
 */
export function trimSource(src: SourceMap): SourceMap {
  const { cols, rows } = src.grid;
  const b: Box = {
    x0: -TRIM_MARGIN,
    y0: -TRIM_MARGIN,
    x1: cols + TRIM_MARGIN,
    y1: rows + TRIM_MARGIN,
  };
  const trim = (shapes: Shape[]): Shape[] =>
    shapes.flatMap((s) => trimShape(s, b));
  return {
    ...src,
    layers: {
      ...src.layers,
      water: trim(src.layers.water),
      mountains: trim(src.layers.mountains),
      parks: trim(src.layers.parks),
    },
  };
}

/** What the sim needs to start a map. */
export interface SimMap {
  grid: Grid;
  startFence: { col: number; row: number; cols: number; rows: number };
  rules: MapRule[];
}

/** Turns a compiled map into the grid, fence and rules the sim starts from. */
export function toSimMap(map: CompiledMap): SimMap {
  return {
    grid: {
      cols: map.cols,
      rows: map.rows,
      terrain: map.terrain.slice() as TerrainKind[],
    },
    startFence: { ...map.fence },
    rules: map.rules.map((r) => ({ ...r })),
  };
}
