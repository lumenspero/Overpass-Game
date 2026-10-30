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
