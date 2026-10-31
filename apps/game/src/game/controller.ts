import type {
  CrossingKind,
  CrossingResult,
  CrossingTileRecord,
  CurvePoint,
  Motorway,
  MotorwayResult,
} from '@overpass-game/sim';
import {
  distanceToCurve,
  motorwayCurve,
  motorwaysTouching,
  placeControl,
  placeDestinationUpgrade,
  type DestinationResult,
  type ControlKind,
  type ControlResult,
  nudgeMotorway,
  placeMotorway,
  removeMotorway,
  restoreMotorway,
} from '@overpass-game/sim';
import {
  linkPartners,
  linkTiles,
  placeCrossing,
  releaseCrossingTile,
  restoreCrossingTile,
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
      /** The crossing run the tile was in before an erase took it out. Restored on rollback. */
      crossing?: CrossingTileRecord | null;
      /** Motorways whose ramp this erase took out. Restored on rollback. */
      motorways?: Motorway[];
    }
  | { kind: 'link'; a: number; b: number }
  | { kind: 'motorway'; motorway: Motorway };

interface Stroke {
  mode: StrokeMode;
  path: TileXY[];
  /** Set when a tile refuses (water, mountain, out of bounds, no budget). The stroke stops there. */
  halted: boolean;
  changes: Change[];
  /** A motorway's pointer path in tile units: its shape is the curve. */
  drag: CurvePoint[];
  /** Set when the stroke moves a handle of a motorway instead of drawing. */
  nudge: { id: number; handle: number } | null;
}

/** The outcome of one bridge, tunnel or motorway release. `seq` rises with every release. */
export type CrossingReport =
  | { seq: number; kind: CrossingKind; result: CrossingResult }
  | { seq: number; kind: 'motorway'; result: MotorwayResult }
  | {
      seq: number;
      kind: 'control';
      control: ControlKind;
      result: ControlResult;
    }
  | { seq: number; kind: 'destination'; result: DestinationResult };

export interface Controller {
  sim: SimState;
  stroke: Stroke | null;
  /** The outcome of the last bridge or tunnel, for the debug line. */
  note: string | null;
  /** The same outcome as data, so the scene can say it on screen. */
  crossing: CrossingReport | null;
  /** The motorway currently selected, whose handles can be nudged. */
  selected: number | null;
}

/** Converts a screen point to tile units. The result is fractional: 3.5 is the centre of tile 3. */
export type ToTile = (screen: Vec2) => TileXY;

export function createController(sim: SimState): Controller {
  return { sim, stroke: null, note: null, crossing: null, selected: null };
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
    const motorways = motorwaysTouching(ctl.sim.motorways, i);
    const crossing = releaseCrossingTile(ctl.sim, i);
    removeRoads(ctl.sim, [i]);
    stroke.changes.push({
      kind: 'tile',
      index: i,
      wasRoad: 1,
      partners,
      crossing,
      motorways,
    });
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

function isCrossing(mode: StrokeMode): mode is 'bridge' | 'tunnel' {
  return mode === 'bridge' || mode === 'tunnel';
}

/** Records the path a crossing stroke has taken so far. Nothing is built until release. */
function trace(stroke: Stroke, at: Vec2, toTile: ToTile): void {
  const tile = strokeTile(toTile(at), false);
  if (tile) extendPath(stroke.path, tile);
}

/**
 * Builds a bridge or tunnel along the path the stroke took, ending where it was released.
 * The sim decides whether it fits; the note says why it did not.
 */
function crossTo(
  ctl: Controller,
  stroke: Stroke,
  at: Vec2,
  toTile: ToTile,
): boolean {
  const kind = stroke.mode;
  if (!isCrossing(kind)) return false;
  const end = strokeTile(toTile(at), true);
  if (end) extendPath(stroke.path, end);
  const tiles = stroke.path.map((t) => indexOf(ctl.sim, t));
  const result: CrossingResult = tiles.some((i) => i === null)
    ? { ok: false, reason: 'out-of-bounds' }
    : placeCrossing(ctl.sim, kind, tiles as number[]);
  ctl.note = result.ok
    ? `${kind} built (${result.crossings})`
    : `${kind} refused: ${result.reason}`;
  ctl.crossing = { seq: (ctl.crossing?.seq ?? 0) + 1, kind, result };
  return result.ok;
}

/** How close a press must be to a handle, or to a curve, to take it, in tile units. */
const HANDLE_RADIUS = 0.45;
const CURVE_RADIUS = 0.35;

type Grab =
  | { kind: 'handle'; id: number; handle: number }
  | { kind: 'curve'; id: number };

/** The motorway whose curve is under `at`, or null. */
function curveAt(ctl: Controller, at: TileXY): number | null {
  let best: { id: number; d: number } | null = null;
  for (const m of ctl.sim.motorways) {
    const d = distanceToCurve(motorwayCurve(ctl.sim.grid, m), at);
    if (d <= CURVE_RADIUS && (best === null || d < best.d)) {
      best = { id: m.id, d };
    }
  }
  return best ? best.id : null;
}

/** Removes a motorway the erase stroke touched. Undo puts it back. */
function eraseMotorway(ctl: Controller, stroke: Stroke, id: number): boolean {
  const motorway = removeMotorway(ctl.sim, id);
  if (!motorway) return false;
  if (ctl.selected === id) ctl.selected = null;
  stroke.changes.push({ kind: 'motorway', motorway });
  return true;
}

/** Places a roundabout or light on the tile pressed, reporting the result like a crossing. */
function placeControlAt(
  ctl: Controller,
  at: TileXY,
  kind: ControlKind,
): boolean {
  const { cols, rows } = ctl.sim.grid;
  const x = Math.floor(at.x);
  const y = Math.floor(at.y);
  const result: ControlResult =
    x < 0 || y < 0 || x >= cols || y >= rows
      ? { ok: false, reason: 'out-of-bounds' }
      : placeControl(ctl.sim, y * cols + x, kind);
  ctl.crossing = {
    seq: (ctl.crossing?.seq ?? 0) + 1,
    kind: 'control',
    control: kind,
    result,
  };
  ctl.note = result.ok ? `${kind} built` : `${kind} refused: ${result.reason}`;
  return result.ok;
}

/** Upgrades the destination pressed, if there is one, reporting the result like a crossing. */
function placeDestinationAt(ctl: Controller, at: TileXY): boolean {
  const { cols, rows } = ctl.sim.grid;
  const x = Math.floor(at.x);
  const y = Math.floor(at.y);
  const onMap = x >= 0 && y >= 0 && x < cols && y < rows;
  const id = onMap ? ctl.sim.buildingAt[y * cols + x] : -1;
  const result: DestinationResult =
    id === -1
      ? { ok: false, reason: 'not-a-destination' }
      : placeDestinationUpgrade(ctl.sim, id);
  ctl.crossing = {
    seq: (ctl.crossing?.seq ?? 0) + 1,
    kind: 'destination',
    result,
  };
  ctl.note = result.ok
    ? 'destination upgraded'
    : `destination refused: ${result.reason}`;
  return result.ok;
}

/** What a press at `at` takes: a handle of the selected motorway, or the curve of any motorway. */
function grabAt(ctl: Controller, at: TileXY): Grab | null {
  const selected = ctl.sim.motorways.find((m) => m.id === ctl.selected);
  if (selected) {
    const handle = selected.handles.findIndex(
      (h) => Math.hypot(h.x - at.x, h.y - at.y) <= HANDLE_RADIUS,
    );
    if (handle >= 0) return { kind: 'handle', id: selected.id, handle };
  }
  const id = curveAt(ctl, at);
  return id === null ? null : { kind: 'curve', id };
}

function newStroke(
  mode: StrokeMode,
  nudge: { id: number; handle: number } | null = null,
): Stroke {
  return { mode, path: [], halted: false, changes: [], drag: [], nudge };
}

/** Keeps a motorway's drag path, skipping points too close to the last one to shape the curve. */
function addDragPoint(stroke: Stroke, at: TileXY): void {
  const last = stroke.drag[stroke.drag.length - 1];
  if (!last || Math.hypot(at.x - last.x, at.y - last.y) >= 0.1) {
    stroke.drag.push({ x: at.x, y: at.y });
  }
}

/** Moves the handle a nudge holds to the pointer. A refused position leaves the handle where it was. */
function nudgeTo(ctl: Controller, stroke: Stroke, at: TileXY): boolean {
  if (!stroke.nudge) return false;
  const { id, handle } = stroke.nudge;
  return nudgeMotorway(ctl.sim, id, handle, { x: at.x, y: at.y }).ok;
}

/** Places a motorway from where the drag started to where it was released. The drag shapes it. */
function motorwayTo(ctl: Controller, stroke: Stroke, at: TileXY): boolean {
  const release = { x: at.x, y: at.y };
  const drag = stroke.drag.length > 0 ? [...stroke.drag, release] : [release];
  const start = drag[0];
  const a = indexOf(ctl.sim, {
    x: Math.floor(start.x),
    y: Math.floor(start.y),
  });
  const b = indexOf(ctl.sim, {
    x: Math.floor(release.x),
    y: Math.floor(release.y),
  });
  const result: MotorwayResult =
    a === null || b === null
      ? { ok: false, reason: 'out-of-bounds' }
      : placeMotorway(ctl.sim, a, b, drag);
  ctl.note = result.ok
    ? 'motorway built'
    : `motorway refused: ${result.reason}`;
  ctl.crossing = {
    seq: (ctl.crossing?.seq ?? 0) + 1,
    kind: 'motorway',
    result,
  };
  return result.ok;
}

function rollback(ctl: Controller, stroke: Stroke): boolean {
  // Undo newest first, so each restore sees the budget, tiles and links it expects.
  for (const c of [...stroke.changes].reverse()) {
    if (c.kind === 'link') {
      unlinkTiles(ctl.sim, c.a, c.b);
    } else if (c.kind === 'motorway') {
      restoreMotorway(ctl.sim, c.motorway);
    } else if (c.wasRoad === 0) {
      removeRoads(ctl.sim, [c.index]);
    } else {
      placeRoads(ctl.sim, [c.index]);
      for (const p of c.partners) linkTiles(ctl.sim, c.index, p);
      if (c.crossing) restoreCrossingTile(ctl.sim, c.index, c.crossing);
      for (const m of c.motorways ?? []) restoreMotorway(ctl.sim, m);
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
      const at = toTile(intent.at);
      if (intent.mode === 'destination') {
        ctl.stroke = null;
        return placeDestinationAt(ctl, at);
      }
      if (intent.mode === 'roundabout' || intent.mode === 'light') {
        ctl.stroke = null;
        return placeControlAt(ctl, at, intent.mode);
      }
      if (intent.mode === 'erase') {
        const id = curveAt(ctl, at);
        if (id !== null) {
          ctl.stroke = newStroke('erase');
          return eraseMotorway(ctl, ctl.stroke, id);
        }
      }
      if (intent.mode === 'draw' || intent.mode === 'select') {
        // A press on a selected motorway's handle nudges it; a press on any motorway's curve
        // selects it; anywhere else starts a road as before.
        const grab = grabAt(ctl, at);
        if (grab?.kind === 'handle') {
          ctl.stroke = newStroke('draw', { id: grab.id, handle: grab.handle });
          return false;
        }
        if (grab?.kind === 'curve') {
          ctl.selected = grab.id;
          ctl.stroke = null;
          return false;
        }
        ctl.selected = null;
      }
      if (intent.mode === 'select') {
        ctl.stroke = null;
        return false;
      }
      ctl.stroke = newStroke(intent.mode);
      if (intent.mode === 'motorway') {
        ctl.stroke.drag = [{ x: at.x, y: at.y }];
        return false;
      }
      if (isCrossing(intent.mode)) {
        // A crossing remembers where it began and is built on release.
        const start = strokeTile(at, true);
        if (start) ctl.stroke.path = [start];
        return false;
      }
      return extend(ctl, ctl.stroke, intent.at, toTile, true);
    }
    case 'stroke-move': {
      const current = ctl.stroke;
      if (!current) return false;
      if (current.nudge) return nudgeTo(ctl, current, toTile(intent.at));
      if (current.mode === 'erase') {
        const id = curveAt(ctl, toTile(intent.at));
        if (id !== null && eraseMotorway(ctl, current, id)) return true;
      }
      if (current.mode === 'motorway') {
        addDragPoint(current, toTile(intent.at));
        return false;
      }
      if (isCrossing(current.mode)) {
        trace(current, intent.at, toTile);
        return false;
      }
      return extend(ctl, current, intent.at, toTile, false);
    }
    case 'stroke-end': {
      const stroke = ctl.stroke;
      ctl.stroke = null;
      if (stroke && intent.at && stroke.nudge) {
        return nudgeTo(ctl, stroke, toTile(intent.at));
      }
      if (stroke && intent.at && stroke.mode === 'motorway') {
        return motorwayTo(ctl, stroke, toTile(intent.at));
      }
      if (stroke && intent.at && isCrossing(stroke.mode)) {
        return crossTo(ctl, stroke, intent.at, toTile);
      }
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
