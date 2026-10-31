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
const SAMPLES_PER_SEGMENT = 16;
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
    for (let s = 0; s < SAMPLES_PER_SEGMENT; s++) {
      out.push(cubic(p0, p1, p2, p3, s / SAMPLES_PER_SEGMENT));
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

/** Tiles whose centre lies inside the ring. A tile belongs to a region when its centre is inside. */
function ringTiles(ring: Pt[], cols: number, rows: number): number[] {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(cols - 1, Math.floor(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(rows - 1, Math.floor(Math.max(...ys)));
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (insideRing(x + 0.5, y + 0.5, ring)) out.push(y * cols + x);
    }
  }
  return out;
}

/** Tiles whose centre is within half the stroke width of the line. */
function strokeTiles(
  line: Pt[],
  width: number,
  cols: number,
  rows: number,
): number[] {
  const r = width / 2;
  const xs = line.map((p) => p.x);
  const ys = line.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - r));
  const x1 = Math.min(cols - 1, Math.floor(Math.max(...xs) + r));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - r));
  const y1 = Math.min(rows - 1, Math.floor(Math.max(...ys) + r));
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = { x: x + 0.5, y: y + 0.5 };
      let near = false;
      for (let i = 0; i < line.length - 1 && !near; i++) {
        near = distanceToSegment(c, line[i], line[i + 1]) <= r;
      }
      if (near) out.push(y * cols + x);
    }
  }
  return out;
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
 * Districts default to 0; later district regions win. Spawn weights add up where spawn zones
 * overlap, and only land and park tiles take weight.
 */
export function compileMap(src: SourceMap): CompiledMap {
  const { cols, rows } = src.grid;
  const n = cols * rows;
  const terrain: TerrainKind[] = new Array<TerrainKind>(n).fill(Terrain.Land);
  const paint = (shape: Geometry, kind: TerrainKind): void => {
    for (const t of shapeTiles(shape, cols, rows)) terrain[t] = kind;
  };
  for (const s of src.layers.parks) paint(s, Terrain.Park);
  for (const s of src.layers.mountains) paint(s, Terrain.Mountain);
  for (const s of src.layers.water) paint(s, Terrain.Water);

  const districts = new Array<number>(n).fill(0);
  for (const d of src.grid.districts) {
    for (const t of shapeTiles(d.region, cols, rows)) districts[t] = d.district;
  }

  const spawnWeights = new Array<number>(n).fill(0);
  for (const z of src.layers.spawnZones) {
    for (const t of shapeTiles(z, cols, rows)) {
      const kind = terrain[t];
      if (kind === Terrain.Land || kind === Terrain.Park) {
        spawnWeights[t] += z.weight;
      }
    }
  }

  const body = {
    schemaVersion: src.schemaVersion,
    id: src.id,
    name: src.name,
    cols,
    rows,
    terrain,
    districts,
    spawnWeights,
    outlines: {
      water: src.layers.water.map(outlineOf),
      mountains: src.layers.mountains.map(outlineOf),
    },
    motorwayGuide: src.layers.motorwayGuide.flatMap((l) =>
      clipPolyline(l.points, cols, rows),
    ),
    starterRoads: src.layers.starterRoads.flatMap((l) =>
      tilePaths(l.points, cols, rows),
    ),
    rules: src.rules,
    palette: src.palette,
    attribution: src.attribution,
  };
  return { ...body, contentHash: contentHash(JSON.stringify(body)) };
}

/** What the sim needs to start a map. */
export interface SimMap {
  grid: Grid;
  districts: number[];
  rules: MapRule[];
}

/** Turns a compiled map into the grid, districts and rules the sim starts from. */
export function toSimMap(map: CompiledMap): SimMap {
  return {
    grid: {
      cols: map.cols,
      rows: map.rows,
      terrain: map.terrain.slice() as TerrainKind[],
    },
    districts: map.districts.slice(),
    rules: map.rules.map((r) => ({ ...r })),
  };
}
