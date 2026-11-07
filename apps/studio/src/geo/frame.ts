import {
  US_BBOX,
  DEFAULT_FRAME_TILES,
  MAX_FRAME_TILES,
  METRES_PER_TILE,
  MIN_FRAME_TILES,
} from '../config.ts';
import {
  lonLatToMercator,
  mercatorToLonLat,
  type LonLat,
  type Metres,
} from './mercator.ts';

/**
 * The map frame: a cols x rows rectangle of tiles centred on a point, turned
 * counter-clockwise by rotationDeg in the Mercator plane.
 */
export interface Frame {
  readonly centre: Metres;
  readonly cols: number;
  readonly rows: number;
  readonly rotationDeg: number;
}

/** Bounding box as [west, south, east, north] in degrees. */
export type BBox = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];

/** Turns an angle into the range (-180, 180]. */
export function normaliseRotation(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

/** Rotates a vector counter-clockwise by deg (x east, y north). */
export function rotateVector(
  [x, y]: readonly [number, number],
  deg: number,
): [number, number] {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [x * c - y * s, x * s + y * c];
}

export function clampTiles(tiles: number): number {
  return Math.min(
    MAX_FRAME_TILES,
    Math.max(MIN_FRAME_TILES, Math.round(tiles)),
  );
}

/** Corners in Mercator metres, counter-clockwise from south-west. */
export function frameCornersMercator(frame: Frame): Metres[] {
  const halfW = (frame.cols * METRES_PER_TILE) / 2;
  const halfH = (frame.rows * METRES_PER_TILE) / 2;
  const local: [number, number][] = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
  ];
  return local.map((p): Metres => {
    const [dx, dy] = rotateVector(p, frame.rotationDeg);
    return [frame.centre[0] + dx, frame.centre[1] + dy];
  });
}

export function frameCornersLonLat(frame: Frame): LonLat[] {
  return frameCornersMercator(frame).map((p) => mercatorToLonLat(p));
}

/**
 * Bounding box of the frame in degrees. The corners are enough: the frame's
 * edges are straight in Mercator, and longitude and latitude are monotonic
 * along them, so their extremes sit at the corners.
 */
export function frameBBox(frame: Frame): BBox {
  const corners = frameCornersLonLat(frame);
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ];
}

/** True when a point lies inside the US bounding box. */
export function isInsideUSPoint([lon, lat]: LonLat): boolean {
  const [west, south, east, north] = US_BBOX;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

/** True when every corner lies inside the US bounding box. */
export function isInsideUS(frame: Frame): boolean {
  return frameCornersLonLat(frame).every(isInsideUSPoint);
}

/** Builds a frame from a drag across the map: the drag is the unrotated rectangle. */
export function frameFromDrag(
  a: Metres,
  b: Metres,
  rotationDeg: number,
): Frame {
  return {
    centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    cols: clampTiles(Math.abs(b[0] - a[0]) / METRES_PER_TILE),
    rows: clampTiles(Math.abs(b[1] - a[1]) / METRES_PER_TILE),
    rotationDeg: normaliseRotation(rotationDeg),
  };
}

/** Builds a frame centred on a place. */
export function frameAt(
  centre: LonLat,
  cols: number,
  rows: number,
  rotationDeg: number,
): Frame {
  return {
    centre: lonLatToMercator(centre),
    cols: clampTiles(cols),
    rows: clampTiles(rows),
    rotationDeg: normaliseRotation(rotationDeg),
  };
}

export function withRotation(frame: Frame, rotationDeg: number): Frame {
  return { ...frame, rotationDeg: normaliseRotation(rotationDeg) };
}

export function defaultFrameAt(centre: LonLat, rotationDeg = 0): Frame {
  return frameAt(centre, DEFAULT_FRAME_TILES, DEFAULT_FRAME_TILES, rotationDeg);
}
