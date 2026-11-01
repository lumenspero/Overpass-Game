import {
  type CurvePoint,
  type Grid,
  handlesFromDrag,
  pointAtDistance,
  polylineLength,
  sampleCurve,
  tuning,
  tileCentre,
} from '@overpass-game/sim';

/**
 * The curve a motorway would take for a drag that is still going, for the translucent preview.
 * Null until the press and the pointer are on different tiles, both on the map.
 */
export function motorwayPreview(
  grid: Grid,
  drag: readonly CurvePoint[],
): CurvePoint[] | null {
  if (drag.length < 2) return null;
  const first = drag[0];
  const last = drag[drag.length - 1];
  const onMap = (p: CurvePoint): boolean =>
    p.x >= 0 && p.y >= 0 && p.x < grid.cols && p.y < grid.rows;
  if (!onMap(first) || !onMap(last)) return null;
  const a = Math.floor(first.y) * grid.cols + Math.floor(first.x);
  const b = Math.floor(last.y) * grid.cols + Math.floor(last.x);
  if (a === b) return null;
  return sampleCurve([
    tileCentre(grid, a),
    ...handlesFromDrag(drag, tuning.MOTORWAY_MAX_NODES),
    tileCentre(grid, b),
  ]);
}

/** How much of each end of a motorway is a ramp, in tile units. */
export const RAMP_TILES = 1;

/** The part of a polyline between two distances along it, from `from` to `to`. */
export function sliceCurve(
  curve: readonly CurvePoint[],
  from: number,
  to: number,
): CurvePoint[] {
  const out: CurvePoint[] = [pointAtDistance(curve, from)];
  let arc = 0;
  for (let k = 1; k < curve.length; k++) {
    arc += Math.hypot(curve[k].x - curve[k - 1].x, curve[k].y - curve[k - 1].y);
    if (arc > from && arc < to) out.push(curve[k]);
  }
  out.push(pointAtDistance(curve, to));
  return out;
}

/**
 * A motorway's curve split into its two ramps, which meet the ground road and are drawn like
 * one, and its elevated middle, which is drawn raised with a shadow.
 */
export function motorwayParts(curve: readonly CurvePoint[]): {
  start: CurvePoint[];
  middle: CurvePoint[];
  end: CurvePoint[];
} {
  const total = polylineLength(curve);
  const ramp = Math.min(RAMP_TILES, total / 3);
  return {
    start: sliceCurve(curve, 0, ramp),
    middle: sliceCurve(curve, ramp, total - ramp),
    end: sliceCurve(curve, total - ramp, total),
  };
}

/** The motorway shield's width and height, and its number's height, in tile units. */
export const BADGE_W = 0.44;
export const BADGE_H = 0.48;
export const BADGE_TEXT_TILES = 0.3;
/** Digits are narrower than the default font, as on the reference shields. */
export const BADGE_TEXT_SCALE_X = 0.8;
export const BADGE_STROKE_TILES = 0.05;

/** Where a motorway's shield sits: the middle of its curve. */
export function badgeAnchor(curve: readonly CurvePoint[]): CurvePoint {
  return pointAtDistance(curve, polylineLength(curve) / 2);
}

/** Points per curve segment of a shield outline. */
const SHIELD_STEPS = 8;

type Unit = readonly [number, number];

/**
 * The outline of a motorway shield centred on `centre`, in tile units. It is one closed run of
 * cubic curves, each starting where the last ends, so the border has no gaps or kinks: a
 * shallow peak across the top, sides that bow in slightly, and a rounded point at the bottom.
 * Coordinates are in units of the shield's width and height, from its centre.
 */
export function shieldOutline(centre: CurvePoint): CurvePoint[] {
  const at = (x: number, y: number): CurvePoint => ({
    x: centre.x + x * BADGE_W,
    y: centre.y + y * BADGE_H,
  });
  // Each segment is [start, control, control, end]. The end of one is the start of the next.
  const segments: (readonly [Unit, Unit, Unit, Unit])[] = [
    [
      [-0.5, -0.36],
      [-0.25, -0.6],
      [0.25, -0.6],
      [0.5, -0.36],
    ],
    [
      [0.5, -0.36],
      [0.5, -0.2],
      [0.5, -0.05],
      [0.5, 0.02],
    ],
    [
      [0.5, 0.02],
      [0.5, 0.28],
      [0.22, 0.44],
      [0, 0.5],
    ],
    [
      [0, 0.5],
      [-0.22, 0.44],
      [-0.5, 0.28],
      [-0.5, 0.02],
    ],
    [
      [-0.5, 0.02],
      [-0.5, -0.05],
      [-0.5, -0.2],
      [-0.5, -0.36],
    ],
  ];
  const out: CurvePoint[] = [];
  for (const [p0, p1, p2, p3] of segments) {
    // Each segment includes its start and leaves out its end, which the next one starts with.
    for (let k = 0; k < SHIELD_STEPS; k++) {
      const t = k / SHIELD_STEPS;
      const u = 1 - t;
      const w0 = u * u * u;
      const w1 = 3 * u * u * t;
      const w2 = 3 * u * t * t;
      const w3 = t * t * t;
      out.push(
        at(
          w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
          w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1],
        ),
      );
    }
  }
  return out;
}
