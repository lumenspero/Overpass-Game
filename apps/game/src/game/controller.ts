import {
  linkPartners,
  linkTiles,
  placeRoads,
  removeRoads,
  type SimState,
  unlinkTiles,
} from '@overpass-game/sim';
import type { Intent, StrokeMode, Vec2 } from '../input/intents.ts';
import { STROKE_SETTLE_TILES } from '../input/config.ts';
import { extendPath, type TileXY } from '../input/path.ts';

/**
 * Turns input intents into sim commands. The view owns this sequencing (which
 * tiles a stroke touches, and when it stops); the sim owns every rule about
 * whether a tile can take a road or pay for one.
 *
 * Roads are placed as the finger moves, so the player sees them immediately.
 * A draw stroke links each step it takes, so the path the player drew is the road,
 * and nearby roads never join by themselves. Each stroke keeps an undo log, so a cancelled stroke
 * rolls back completely, links included.
 */

type Change =
  | {
      kind: 'tile';
      index: number;
      /** Road state before the stroke touched this tile: 0 or 1. */
      wasRoad: 0 | 1;
      /** Links the tile had before an erase took them. Restored on rollback. */
      partners: number[];
    }
  | { kind: 'link'; a: number; b: number };

interface Stroke {
  mode: StrokeMode;
  path: TileXY[];
  /** Set when a tile refuses (water, mountain, out of bounds, no budget). The stroke stops there. */
  halted: boolean;
  changes: Change[];
}

export interface Controller {
  sim: SimState;
  stroke: Stroke | null;
}

/** Converts a screen point to tile units. The result is fractional: 3.5 is the centre of tile 3. */
export type ToTile = (screen: Vec2) => TileXY;

export function createController(sim: SimState): Controller {
  return { sim, stroke: null };
}

function indexOf(sim: SimState, t: TileXY): number | null {
  const { cols, rows } = sim.grid;
  if (t.x < 0 || t.y < 0 || t.x >= cols || t.y >= rows) return null;
  return t.y * cols + t.x;
}

function touchTile(ctl: Controller, stroke: Stroke, t: TileXY): boolean {
  const i = indexOf(ctl.sim, t);
  if (stroke.mode === 'erase') {
    if (i === null || ctl.sim.roads[i] !== 1) return false;
    const partners = [...linkPartners(ctl.sim.links, i)];
    removeRoads(ctl.sim, [i]);
    stroke.changes.push({ kind: 'tile', index: i, wasRoad: 1, partners });
    return true;
  }
  if (i === null) {
    stroke.halted = true;
    return false;
  }
  if (ctl.sim.roads[i] === 1) return false; // already a road: free, keep going
  const result = placeRoads(ctl.sim, [i]);
  if (!result.ok) {
    stroke.halted = true;
    return false;
  }
  stroke.changes.push({ kind: 'tile', index: i, wasRoad: 0, partners: [] });
  return true;
}

/**
 * Links the previous and the new tile of a draw stroke. Every step the drag takes is a
 * link, across an edge or a corner, so the path the player drew is the road.
 */
function linkStep(
  ctl: Controller,
  stroke: Stroke,
  from: TileXY,
  to: TileXY,
): boolean {
  const a = indexOf(ctl.sim, from);
  const b = indexOf(ctl.sim, to);
  if (a === null || b === null) return false;
  if (!linkTiles(ctl.sim, a, b)) return false;
  stroke.changes.push({ kind: 'link', a, b });
  return true;
}

/**
 * The tile a stroke should take for this pointer position, or null if it should take none.
 * A press takes the tile under the pointer. A move takes a tile only once the pointer has
 * settled near its centre, so a fast corner doesn't leave stray tiles along the edges.
 */
function strokeTile(p: TileXY, press: boolean): TileXY | null {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (press) return { x, y };
  const fx = p.x - x - 0.5;
  const fy = p.y - y - 0.5;
  if (Math.hypot(fx, fy) > STROKE_SETTLE_TILES) return null;
  return { x, y };
}

function extend(
  ctl: Controller,
  stroke: Stroke,
  at: Vec2,
  toTile: ToTile,
  press: boolean,
): boolean {
  if (stroke.halted) return false;
  const tile = strokeTile(toTile(at), press);
  if (tile === null) return false;
  const start = stroke.path.length;
  const added = extendPath(stroke.path, tile);
  let changed = false;
  for (let k = start; k < start + added.length; k++) {
    if (stroke.halted) break;
    const t = stroke.path[k];
    changed = touchTile(ctl, stroke, t) || changed;
    if (stroke.halted) break;
    if (stroke.mode === 'draw' && k > 0) {
      // A new link changes what is drawn, so the view must redraw even with no new road.
      changed = linkStep(ctl, stroke, stroke.path[k - 1], t) || changed;
    }
  }
  return changed;
}

function rollback(ctl: Controller, stroke: Stroke): boolean {
  // Undo newest first, so each restore sees the budget, tiles and links it expects.
  for (const c of [...stroke.changes].reverse()) {
    if (c.kind === 'link') {
      unlinkTiles(ctl.sim, c.a, c.b);
    } else if (c.wasRoad === 0) {
      removeRoads(ctl.sim, [c.index]);
    } else {
      placeRoads(ctl.sim, [c.index]);
      for (const p of c.partners) linkTiles(ctl.sim, c.index, p);
    }
  }
  return stroke.changes.length > 0;
}

/**
 * Applies one intent to the sim. Returns true if the road set changed, so the
 * view knows to redraw. Pan and zoom are not handled here; they move the camera.
 */
export function applyIntent(
  ctl: Controller,
  intent: Intent,
  toTile: ToTile,
): boolean {
  switch (intent.type) {
    case 'stroke-begin': {
      // A new stroke commits any unfinished one first.
      ctl.stroke = { mode: intent.mode, path: [], halted: false, changes: [] };
      return extend(ctl, ctl.stroke, intent.at, toTile, true);
    }
    case 'stroke-move':
      return ctl.stroke
        ? extend(ctl, ctl.stroke, intent.at, toTile, false)
        : false;
    case 'stroke-end': {
      const stroke = ctl.stroke;
      ctl.stroke = null;
      // Releasing a draw stroke takes the tile under the pointer, so the last step of the
      // drag is linked even if the pointer never settled on that tile's centre.
      if (stroke && intent.at && stroke.mode === 'draw') {
        return extend(ctl, stroke, intent.at, toTile, true);
      }
      return false;
    }
    case 'stroke-cancel': {
      const stroke = ctl.stroke;
      ctl.stroke = null;
      return stroke ? rollback(ctl, stroke) : false;
    }
    default:
      return false;
  }
}
