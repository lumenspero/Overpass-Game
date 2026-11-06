import { TILE_SIZE } from '@overpass-game/render-style';
import {
  type Building,
  buildingCentre,
  type Demand,
  type Grid,
} from '@overpass-game/sim';
import { DESTINATION_RADIUS } from './geometry.ts';

/**
 * Demand pins (spec: Demand, Overflow). Each waiting request shows as a small pin in its business's colour,
 * on top of the building: a 3×3 grid on a square business, a clock-face ring on a round one. While the
 * business overflows, one large red and white pin replaces them, filling red counterclockwise from the top.
 * Pure: no Phaser, so it is unit-tested directly.
 */

export interface Point {
  x: number;
  y: number;
}

/** A small pin: its head's centre in world units, its colour, and its place in the layout. */
export interface SmallPin extends Point {
  destination: number;
  index: number;
  color: number;
}

/** The large overflow pin: its head's centre in world units, and how full it is, 0 to 1. */
export interface BigPin extends Point {
  destination: number;
  fill: number;
}

/** Small pins shown on one building at most: the 3×3 grid and the clock face both hold nine. */
export const PIN_SLOTS = 9;
/** A small pin's head radius, in world units. */
export const SMALL_PIN_HEAD = 0.157 * DESTINATION_RADIUS;
/** The large pin's head radius, in world units. */
export const BIG_PIN_HEAD = 0.49 * DESTINATION_RADIUS;
/** How far a pin's tip lies below its head's centre, in head radii. */
export const PIN_TIP = 1.6;
/** A pin's shadow offset, in head radii: a little right and down. */
export const PIN_SHADOW = { x: 0.26, y: 0.35 };

/** Spacing of the square grid, and the clock face's radius, in world units. */
const GRID_STEP = 0.6 * DESTINATION_RADIUS;
const CLOCK_RADIUS = 0.69 * DESTINATION_RADIUS;
/** Pins sit a little high, so the grid or ring of heads and tips looks centred on the building. */
const LIFT = 0.12 * DESTINATION_RADIUS;
const BIG_LIFT = 0.34 * DESTINATION_RADIUS;

/** Where the `index`-th small pin's head sits, from the building's centre: row by row, or clockwise from 12. */
export function pinSlot(shape: 'square' | 'round', index: number): Point {
  if (shape === 'square') {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return { x: (col - 1) * GRID_STEP, y: (row - 1) * GRID_STEP - LIFT };
  }
  const a = (index / PIN_SLOTS) * Math.PI * 2;
  return {
    x: Math.sin(a) * CLOCK_RADIUS,
    y: -Math.cos(a) * CLOCK_RADIUS - LIFT,
  };
}

/** Every visible business's pins: small ones for waiting requests, or one large one while it overflows. */
export function demandPins(
  buildings: readonly Building[],
  demand: Readonly<Record<number, Demand>>,
  grid: Grid,
  colors: readonly number[],
): { small: SmallPin[]; big: BigPin[] } {
  const small: SmallPin[] = [];
  const big: BigPin[] = [];
  for (const b of buildings) {
    if (b.kind !== 'destination') continue;
    const d = demand[b.id];
    if (!d) continue;
    const c = buildingCentre(grid, b);
    const cx = c.x * TILE_SIZE;
    const cy = c.y * TILE_SIZE;
    const fill = d.overflowFill ?? 0;
    if (fill > 0) {
      big.push({ destination: b.id, x: cx, y: cy - BIG_LIFT, fill });
      continue;
    }
    const shape = b.shape === 'square' ? 'square' : 'round';
    const color = colors[b.color] ?? colors[0] ?? 0;
    const count = Math.min(PIN_SLOTS, Math.max(0, d.pins));
    for (let i = 0; i < count; i++) {
      const at = pinSlot(shape, i);
      small.push({
        destination: b.id,
        index: i,
        color,
        x: cx + at.x,
        y: cy + at.y,
      });
    }
  }
  return { small, big };
}

/**
 * A pin's outline as a polygon: a round head of radius `head` centred on (x, y), narrowing in straight
 * sides to a tip PIN_TIP head radii below. The sides meet the head where they are tangent to it.
 */
export function pinOutline(x: number, y: number, head: number): Point[] {
  // Angle (screen space, y down) of each tangent point, either side of straight down.
  const side = Math.acos(1 / PIN_TIP);
  const right = Math.PI / 2 - side;
  const left = Math.PI / 2 + side - Math.PI * 2;
  const out: Point[] = [{ x, y: y + head * PIN_TIP }];
  const SAMPLES = 28;
  for (let i = 0; i <= SAMPLES; i++) {
    const a = right + ((left - right) * i) / SAMPLES;
    out.push({ x: x + Math.cos(a) * head, y: y + Math.sin(a) * head });
  }
  return out;
}

/** How far from (x, y) a ray at angle `a` meets the polygon, or 0 if it does not. */
function reach(
  poly: readonly Point[],
  x: number,
  y: number,
  a: number,
): number {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (!p || !q) continue;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p.x - x) * ey - (p.y - y) * ex) / den;
    const u = ((p.x - x) * dy - (p.y - y) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
  }
  return best;
}

/**
 * The red part of the large pin at `fill` (0 to 1): a sector from the head's centre, starting straight up and
 * running counterclockwise on screen, cut to the pin's outline. Empty at 0; the whole pin at 1.
 */
export function pinFillPolygon(
  x: number,
  y: number,
  head: number,
  fill: number,
): Point[] {
  const f = Math.min(1, Math.max(0, fill));
  if (f <= 0) return [];
  if (f >= 1) return pinOutline(x, y, head);
  const outline = pinOutline(x, y, head);
  const start = -Math.PI / 2;
  const sweep = f * Math.PI * 2;
  // How far round from the top, counterclockwise on screen (y down, so decreasing angle), each ray is.
  const turns = new Set<number>();
  const steps = Math.max(2, Math.ceil(f * 64));
  for (let i = 0; i <= steps; i++) turns.add((sweep * i) / steps);
  // The outline's corners too, so a sharp point such as the tip is never cut off between rays.
  for (const p of outline) {
    const a = Math.atan2(p.y - y, p.x - x);
    const d = (((start - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (d < sweep) turns.add(d);
  }
  const out: Point[] = [{ x, y }];
  for (const d of [...turns].sort((a, b) => a - b)) {
    const a = start - d;
    const r = reach(outline, x, y, a);
    out.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  return out;
}
