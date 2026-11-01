/**
 * Cars are small rounded rectangles that face their direction of travel, as in the flat
 * minimal style. Their outline is built here, in world units, so the scene only fills it.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Car length as a multiple of its width. */
export const CAR_LENGTH_PER_WIDTH = 1.7;
/** Corner radius as a fraction of the car's width. */
export const CAR_CORNER_PER_WIDTH = 0.22;
/** Points per quarter-turn of a rounded corner. */
const CORNER_STEPS = 3;

/**
 * The outline of a car centred on `centre`, facing `heading` (radians, from the +x axis, with
 * y pointing down the screen). The outline is one closed run of points, going round once.
 */
export function carOutline(centre: Pt, heading: number, width: number): Pt[] {
  const length = width * CAR_LENGTH_PER_WIDTH;
  const r = width * CAR_CORNER_PER_WIDTH;
  const hl = length / 2 - r;
  const hw = width / 2 - r;
  // Each corner's centre and the angle its arc starts at. The arcs run round the outside.
  const corners: [number, number, number][] = [
    [hl, hw, 0],
    [-hl, hw, Math.PI / 2],
    [-hl, -hw, Math.PI],
    [hl, -hw, (3 * Math.PI) / 2],
  ];
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const out: Pt[] = [];
  for (const [cx, cy, start] of corners) {
    for (let k = 0; k <= CORNER_STEPS; k++) {
      const a = start + ((Math.PI / 2) * k) / CORNER_STEPS;
      // Local point, with x along the heading, rotated into the world and moved to the centre.
      const lx = cx + r * Math.cos(a);
      const ly = cy + r * Math.sin(a);
      out.push({
        x: centre.x + lx * cos - ly * sin,
        y: centre.y + lx * sin + ly * cos,
      });
    }
  }
  return out;
}

/** The heading from one point to another, or null when they are the same point. */
export function headingBetween(from: Pt, to: Pt): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  return Math.atan2(dy, dx);
}
