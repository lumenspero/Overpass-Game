import type { MapLabel, Polyline, Shape } from '@overpass-game/map-schema';
import { IMPORT, METRES_PER_TILE } from '../config.ts';
import type { Frame } from '../geo/frame.ts';
import type { LonLat } from '../geo/mercator.ts';
import { LABEL_SIZE } from '../edit/labels.ts';
import { PARK_LANDUSE, RIVER_WATERWAYS } from '../osm/query.ts';
import {
  lineLength,
  ringArea,
  simplifyLine,
  simplifyRing,
  smoothSpline,
} from './geometry.ts';
import { projectToGrid, type GridPoint } from './projection.ts';

/** The GeoJSON features the converter reads. osmtogeojson's output fits this shape. */
export interface OsmFeature {
  readonly id?: string | number;
  readonly properties?: Record<string, unknown> | null;
  readonly geometry: {
    readonly type: string;
    readonly coordinates?: unknown;
  } | null;
}

export interface OsmCollection {
  readonly features: readonly OsmFeature[];
}

export interface ImportedLayers {
  readonly water: Shape[];
  readonly parks: Shape[];
  readonly motorwayGuide: Polyline[];
  /** Names from OSM, placed on the park, water and peak features that were kept. */
  readonly labels: MapLabel[];
}

/** The OSM name of a feature, tidied for a label, or undefined when it has none. */
function nameOf(tags: Record<string, unknown>): string | undefined {
  const name = (tagOf(tags, 'name') ?? '').replace(/\s+/g, ' ').trim();
  return name === '' ? undefined : name.slice(0, 40);
}

/** The average of a list of points: a simple, always-inside-enough place for a label. */
function meanOf(points: readonly { x: number; y: number }[]): {
  x: number;
  y: number;
} {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

function tagOf(tags: Record<string, unknown>, key: string): string | undefined {
  const value = tags[key];
  return typeof value === 'string' ? value : undefined;
}

function isWater(tags: Record<string, unknown>): boolean {
  return (
    tagOf(tags, 'natural') === 'water' ||
    tagOf(tags, 'waterway') === 'riverbank' ||
    tagOf(tags, 'landuse') === 'reservoir'
  );
}

function isPark(tags: Record<string, unknown>): boolean {
  const landuse = tagOf(tags, 'landuse') ?? '';
  return (
    tagOf(tags, 'leisure') === 'park' ||
    (PARK_LANDUSE as readonly string[]).includes(landuse)
  );
}

function asLonLat(value: unknown): LonLat | null {
  if (
    !Array.isArray(value) ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number'
  )
    return null;
  return [value[0], value[1]];
}

function asLine(value: unknown): LonLat[] {
  if (!Array.isArray(value)) return [];
  return value.map(asLonLat).filter((p): p is LonLat => p !== null);
}

/** The outer ring of each polygon in a Polygon or MultiPolygon. Holes are ignored at this stage. */
function outerRings(type: string, coordinates: unknown): LonLat[][] {
  if (type === 'Polygon' && Array.isArray(coordinates))
    return [asLine(coordinates[0])];
  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    return coordinates.map((polygon) =>
      Array.isArray(polygon) ? asLine(polygon[0]) : [],
    );
  }
  return [];
}

/** The lines of a LineString or MultiLineString. */
function lines(type: string, coordinates: unknown): LonLat[][] {
  if (type === 'LineString') return [asLine(coordinates)];
  if (type === 'MultiLineString' && Array.isArray(coordinates))
    return coordinates.map(asLine);
  return [];
}

/**
 * Joins lines whose ends meet exactly, so a coastline split across many OSM
 * ways becomes one line. Lines that do not meet stay separate.
 */
export function stitchLines(input: readonly LonLat[][]): LonLat[][] {
  const pool = input.filter((l) => l.length >= 2).map((l) => l.slice());
  const keyOf = (p: LonLat): string => `${p[0]},${p[1]}`;
  const out: LonLat[][] = [];
  let line = pool.shift();
  while (line) {
    let grew = true;
    while (grew) {
      grew = false;
      const tail = keyOf(line[line.length - 1]!);
      const head = keyOf(line[0]!);
      for (let i = 0; i < pool.length; i++) {
        const other = pool[i]!;
        const otherHead = keyOf(other[0]!);
        const otherTail = keyOf(other[other.length - 1]!);
        if (otherHead === tail) line = line.concat(other.slice(1));
        else if (otherTail === tail)
          line = line.concat(other.slice(0, -1).reverse());
        else if (otherTail === head) line = other.slice(0, -1).concat(line);
        else if (otherHead === head)
          line = other.slice(1).reverse().concat(line);
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(line);
    line = pool.shift();
  }
  return out;
}

/** Stroke width in tiles for a waterway, from its width tag in metres. */
function riverWidthTiles(
  tags: Record<string, unknown>,
  latitude: number,
): number {
  const metres = Number.parseFloat(tagOf(tags, 'width') ?? '');
  if (!Number.isFinite(metres) || metres <= 0) return IMPORT.riverWidthDefault;
  const metresPerTile = METRES_PER_TILE * Math.cos((latitude * Math.PI) / 180);
  return Math.min(
    IMPORT.riverWidthMax,
    Math.max(IMPORT.riverWidthMin, metres / metresPerTile),
  );
}

function dropRepeatedEnd(ring: LonLat[]): LonLat[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first && last && first[0] === last[0] && first[1] === last[1]
    ? ring.slice(0, -1)
    : ring;
}

/**
 * Converts OSM features inside a frame into source shapes, in grid units.
 * Water and parks become closed shapes; rivers and coastlines become strokes;
 * motorways and trunk roads become the guide. Every shape is tagged `osm`.
 */
export function convertFeatures(
  collection: OsmCollection,
  frame: Frame,
): ImportedLayers {
  const project = projectToGrid(frame);
  const water: Shape[] = [];
  const parks: Shape[] = [];
  const motorwayGuide: Polyline[] = [];
  const coastLines: LonLat[][] = [];
  /** Rivers and canals, grouped by kind, name and width, so pieces of one waterway can be joined. */
  const riverGroups = new Map<
    string,
    { id: string; name: string | undefined; width: number; lines: LonLat[][] }
  >();
  const labels: MapLabel[] = [];

  /** A label for a feature's OSM name, when it has one and sits inside the frame. */
  const addLabel = (
    kind: MapLabel['kind'],
    featureId: string,
    text: string | undefined,
    at: { x: number; y: number } | undefined,
  ): void => {
    if (!text || !at) return;
    if (at.x < 0 || at.y < 0 || at.x > frame.cols || at.y > frame.rows) return;
    labels.push({
      id: `label-${featureId}`,
      kind,
      text,
      x: at.x,
      y: at.y,
      size: LABEL_SIZE.default,
    });
  };

  const closedShape = (id: string, ring: LonLat[]): Shape | null => {
    const points: GridPoint[] = simplifyRing(
      dropRepeatedEnd(ring).map(project),
      IMPORT.simplifyTolerance,
    );
    if (points.length < 3 || ringArea(points) < IMPORT.minClosedArea)
      return null;
    return {
      id,
      kind: 'closedSpline',
      points: smoothSpline(points, true),
      origin: 'osm',
    };
  };

  const strokeShape = (
    id: string,
    line: GridPoint[],
    width: number,
  ): Shape | null => {
    const points = simplifyLine(line, IMPORT.simplifyTolerance);
    if (points.length < 2 || lineLength(points) < IMPORT.minStrokeLength)
      return null;
    return {
      id,
      kind: 'strokeSpline',
      points: smoothSpline(points, false),
      width,
      origin: 'osm',
    };
  };

  collection.features.forEach((feature, index) => {
    const geometry = feature.geometry;
    if (!geometry) return;
    const tags = feature.properties ?? {};
    const id = String(feature.id ?? tags['@id'] ?? `feature-${index}`).replace(
      /[^A-Za-z0-9_/-]/g,
      '-',
    );
    // A feature gets one label, from the first of its parts that is kept.
    let labelled = false;

    if (geometry.type === 'Point') {
      if (tagOf(tags, 'natural') === 'peak') {
        const at = asLonLat(geometry.coordinates);
        addLabel('mountain', id, nameOf(tags), at ? project(at) : undefined);
      }
      return;
    }

    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      const isWaterArea = isWater(tags);
      const target = isWaterArea ? water : isPark(tags) ? parks : null;
      if (!target) return;
      outerRings(geometry.type, geometry.coordinates).forEach((ring, i) => {
        const shape = closedShape(`${id}-${i}`, ring);
        if (!shape) return;
        target.push(shape);
        if (!labelled) {
          labelled = true;
          addLabel(
            isWaterArea ? 'water' : 'park',
            id,
            nameOf(tags),
            meanOf(shape.points),
          );
        }
      });
      return;
    }

    const waterway = tagOf(tags, 'waterway');
    const highway = tagOf(tags, 'highway');
    const natural = tagOf(tags, 'natural');
    const lineList = lines(geometry.type, geometry.coordinates);

    if (natural === 'coastline') {
      coastLines.push(...lineList);
    } else if (
      waterway &&
      (RIVER_WATERWAYS as readonly string[]).includes(waterway)
    ) {
      const latitude = lineList[0]?.[0]?.[1] ?? 0;
      const name = nameOf(tags);
      const width = riverWidthTiles(tags, latitude);
      const key = `${waterway}|${name ?? ''}|${width}`;
      const group = riverGroups.get(key) ?? { id, name, width, lines: [] };
      group.lines.push(...lineList);
      riverGroups.set(key, group);
    } else if (highway === 'motorway' || highway === 'trunk') {
      lineList.forEach((line, i) => {
        const points = simplifyLine(
          line.map(project),
          IMPORT.simplifyTolerance,
        );
        if (points.length >= 2)
          motorwayGuide.push({ id: `${id}-${i}`, points });
      });
    }
  });

  riverGroups.forEach((group) => {
    let labelAt: { x: number; y: number } | undefined;
    let labelLength = 0;
    stitchLines(group.lines).forEach((line, i) => {
      const gridLine = line.map(project);
      const shape = strokeShape(`${group.id}-${i}`, gridLine, group.width);
      if (!shape) return;
      water.push(shape);
      if (gridLine.length > labelLength) {
        labelLength = gridLine.length;
        labelAt = gridLine[Math.floor(gridLine.length / 2)];
      }
    });
    if (labelAt) addLabel('water', group.id, group.name, labelAt);
  });

  stitchLines(coastLines).forEach((line, i) => {
    const shape = strokeShape(
      `coast-${i}`,
      line.map(project),
      IMPORT.coastWidth,
    );
    if (shape) water.push(shape);
  });

  return { water, parks, motorwayGuide, labels };
}
