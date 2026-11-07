import type {
  CrossingKind,
  CrossingReason,
  CrossingResult,
  CrossingTileRecord,
  CurvePoint,
  Motorway,
  MotorwayResult,
} from '@overpass-game/sim';
import { isHouseStub, isOpenTile, moveHouseStub } from '@overpass-game/sim';
import {
  distanceToCurve,
  motorwayCurve,
  motorwaysTouching,
  placeControl,
  dropControlsAt,
  restoreControl,
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
  Terrain,
  tuning,
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
      /** The roundabout or light on the tile, taken by this erase. Restored on rollback. */
      control?: ControlKind;
    }
  | { kind: 'control'; index: number; control: ControlKind }
  | { kind: 'link'; a: number; b: number }
  | { kind: 'motorway'; motorway: Motorway }
  /** A house's stub moved. `from` and its links are restored on rollback. */
  | {
      kind: 'stub';
      house: number;
      from: number | undefined;
      partners: number[];
      /** The old stub was a paid road that the move removed and refunded. */
      refunded: boolean;
    }
  /** A link an erase took off a house's stub. Restored on rollback. */
  | { kind: 'unlink'; a: number; b: number }
  /** A road stroke's own bridge or tunnel. Its tiles, links and stock are undone together. */
  | {
      kind: 'auto-crossing';
      crossing: CrossingKind;
      tiles: number[];
      added: number[];
      path: number[];
    };

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
  /** A draw stroke pressed on a house: its first step moves the house's stub there. */
  house: number | null;
  /** Water or mountain tiles a road stroke is crossing, held until it reaches land. Not laid yet. */
  pending?: { kind: CrossingKind; from: number; tiles: number[] } | null;
  /**
   * A road press with the default tool, held until the pointer moves: the first move lays road
   * from here. A click that never moves lays nothing.
   */
  armedAt?: Vec2 | null;
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
    };

export interface Controller {
  sim: SimState;
  stroke: Stroke | null;
  /** The outcome of the last bridge or tunnel, for the debug line. */
  note: string | null;
  /** The same outcome as data, so the scene can say it on screen. */
  crossing: CrossingReport | null;
  /** The motorway currently selected, whose handles can be nudged. */
  selected: number | null;
  /** The first end of a motorway dropped from the dock, waiting for its second click. */
  motorwayStart: TileXY | null;
  /** Where the pointer is, while a motorway waits for its second end. */
  motorwayCursor: TileXY | null;
}

/** Converts a screen point to tile units. The result is fractional: 3.5 is the centre of tile 3. */
export type ToTile = (screen: Vec2) => TileXY;

export function createController(sim: SimState): Controller {
  return {
    sim,
    stroke: null,
    note: null,
    crossing: null,
    selected: null,
    motorwayStart: null,
    motorwayCursor: null,
  };
}

/** A motorway dropped on the map: `at` is its first end, and the next click sets the second. */
export function startMotorway(ctl: Controller, at: TileXY): void {
  ctl.motorwayStart = at;
  ctl.motorwayCursor = at;
}

/** Drops a motorway that is waiting for its second end. Escape and a new dock drag call this. */
export function cancelMotorway(ctl: Controller): void {
  ctl.motorwayStart = null;
  ctl.motorwayCursor = null;
}

/** Places a motorway along a path of tile points. Records the outcome for the debug line and the sounds. */
function motorwayPath(ctl: Controller, drag: TileXY[]): boolean {
  const start = drag[0];
  const end = drag[drag.length - 1];
  if (!start || !end) return false;
  const a = indexOf(ctl.sim, {
    x: Math.floor(start.x),
    y: Math.floor(start.y),
  });
  const b = indexOf(ctl.sim, { x: Math.floor(end.x), y: Math.floor(end.y) });
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

function indexOf(sim: SimState, t: TileXY): number | null {
  const { cols, rows } = sim.grid;
  if (t.x < 0 || t.y < 0 || t.x >= cols || t.y >= rows) return null;
  return t.y * cols + t.x;
}

function touchTile(ctl: Controller, stroke: Stroke, t: TileXY): boolean {
  const i = indexOf(ctl.sim, t);
  if (stroke.mode === 'erase') {
    if (i === null) return false;
    const control = ctl.sim.controls[i];
    if (isHouseStub(ctl.sim, i)) {
      // A house's stub is never erased, but its links are, so the road is cut off and the stub
      // stays behind. A roundabout or light on it can still be taken back.
      let changed = false;
      for (const p of [...linkPartners(ctl.sim.links, i)]) {
        if (unlinkTiles(ctl.sim, i, p)) {
          stroke.changes.push({ kind: 'unlink', a: i, b: p });
          changed = true;
        }
      }
      if (control !== undefined) {
        dropControlsAt(ctl.sim, [i]);
        stroke.changes.push({ kind: 'control', index: i, control });
        changed = true;
      }
      return changed;
    }
    if (ctl.sim.roads[i] !== 1) {
      // A roundabout or light can stand on a tile with no road under it. Erasing takes it back.
      if (control === undefined) return false;
      dropControlsAt(ctl.sim, [i]);
      stroke.changes.push({ kind: 'control', index: i, control });
      return true;
    }
    const partners = [...linkPartners(ctl.sim.links, i)];
    const motorways = motorwaysTouching(ctl.sim.motorways, i);
    const crossing = releaseCrossingTile(ctl.sim, i);
    // removeRoads also takes any control on the tile, so the record keeps it for undo.
    removeRoads(ctl.sim, [i]);
    stroke.changes.push({
      kind: 'tile',
      index: i,
      wasRoad: 1,
      partners,
      crossing,
      motorways,
      control,
    });
    return true;
  }
  if (i === null) {
    stroke.halted = true;
    return false;
  }
  // Land not yet open takes no road, and a hidden house's stub there can't be joined.
  if (!isOpenTile(ctl.sim, i)) {
    stroke.halted = true;
    return false;
  }
  if (stroke.mode === 'draw') {
    const crossed = touchDrawTile(ctl, stroke, t, i);
    if (crossed !== null) return crossed;
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
 * A road stroke over water or mountain (spec: Bridges and tunnels). With a bridge or tunnel in
 * stock, the stroke holds the tiles it crosses and builds them in one piece once it reaches land.
 * Returns null when the tile is not a crossing tile, so the normal road rules apply.
 */
function touchDrawTile(
  ctl: Controller,
  stroke: Stroke,
  t: TileXY,
  i: number,
): boolean | null {
  const terrain = ctl.sim.grid.terrain[i];
  const kind: CrossingKind | null =
    terrain === Terrain.Water
      ? 'bridge'
      : terrain === Terrain.Mountain
        ? 'tunnel'
        : null;
  const open = stroke.pending ?? null;
  if (open === null) {
    if (kind === null || ctl.sim.roads[i] === 1) return null;
    const k = stroke.path.indexOf(t);
    const from = k > 0 ? indexOf(ctl.sim, stroke.path[k - 1]) : null;
    if (from === null || ctl.sim.stock[kind] < 1) {
      stroke.halted = true;
      refuseCrossing(ctl, kind, from === null ? 'bad-endpoint' : 'no-stock');
      return false;
    }
    stroke.pending = { kind, from, tiles: [i] };
    return false;
  }
  if (kind === open.kind && ctl.sim.roads[i] === 0) {
    const span =
      open.kind === 'bridge' ? tuning.BRIDGE_MAX_SPAN : tuning.TUNNEL_MAX_SPAN;
    if (open.tiles.length >= span) {
      stroke.halted = true;
      stroke.pending = null;
      refuseCrossing(ctl, open.kind, 'too-long');
      return false;
    }
    open.tiles.push(i);
    return false;
  }
  return closeCrossing(ctl, stroke, open, i);
}

/**
 * Records a road drag's crossing that could not be built, as a placement report, so the player
 * sees why on screen and hears it, as when a bridge or tunnel tool is refused.
 */
function refuseCrossing(
  ctl: Controller,
  kind: CrossingKind,
  reason: CrossingReason,
): void {
  ctl.note = `${kind} refused: ${reason}`;
  ctl.crossing = {
    seq: (ctl.crossing?.seq ?? 0) + 1,
    kind,
    result: { ok: false, reason },
  };
}

/** Builds the held crossing from its land tile to this one, as one piece. */
function closeCrossing(
  ctl: Controller,
  stroke: Stroke,
  open: { kind: CrossingKind; from: number; tiles: number[] },
  i: number,
): boolean {
  const path = [open.from, ...open.tiles, i];
  const added = path.filter((x) => ctl.sim.roads[x] === 0);
  const result = placeCrossing(ctl.sim, open.kind, path);
  stroke.pending = null;
  ctl.note = result.ok
    ? `${open.kind} built (${result.crossings})`
    : `${open.kind} refused: ${result.reason}`;
  ctl.crossing = {
    seq: (ctl.crossing?.seq ?? 0) + 1,
    kind: open.kind,
    result,
  };
  if (!result.ok) {
    stroke.halted = true;
    return false;
  }
  stroke.changes.push({
    kind: 'auto-crossing',
    crossing: open.kind,
    tiles: open.tiles,
    added,
    path,
  });
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
    if (stroke.mode === 'draw' && k === 0) {
      // A stroke pressed on a house moves the house's stub to the first tile it steps onto.
      const house = houseAt(ctl.sim, t);
      if (house !== null) {
        stroke.house = house;
        continue;
      }
    }
    if (stroke.house !== null && k === 1) {
      changed = moveStub(ctl, stroke, t) || changed;
      continue;
    }
    changed = touchTile(ctl, stroke, t) || changed;
    if (stroke.halted) break;
    if (stroke.mode === 'draw' && k > 0 && stroke.pending == null) {
      // A new link changes what is drawn, so the view must redraw even with no new road.
      changed = linkStep(ctl, stroke, stroke.path[k - 1], t) || changed;
    }
  }
  return changed;
}

/** The house standing on a tile, or null. */
function houseAt(sim: SimState, t: TileXY): number | null {
  const i = indexOf(sim, t);
  if (i === null) return null;
  const id = sim.buildingAt[i];
  if (id === undefined || id < 0) return null;
  return sim.buildings[id]?.kind === 'house' ? id : null;
}

/** Moves the stroke's house stub onto a tile, keeping the old stub and its links for undo. */
function moveStub(ctl: Controller, stroke: Stroke, t: TileXY): boolean {
  const i = indexOf(ctl.sim, t);
  const house = stroke.house;
  if (i === null || house === null) {
    stroke.halted = true;
    return false;
  }
  const from = ctl.sim.buildings[house]?.stub;
  const fromPaid = ctl.sim.buildings[house]?.stubAdopted === true;
  const partners =
    from === undefined ? [] : [...linkPartners(ctl.sim.links, from)];
  const result = moveHouseStub(ctl.sim, house, i);
  if (!result.ok) {
    stroke.halted = true;
    return false;
  }
  if (!result.moved) return false;
  const refunded = fromPaid && from !== undefined && ctl.sim.roads[from] === 0;
  stroke.changes.push({ kind: 'stub', house, from, partners, refunded });
  return true;
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
  return {
    mode,
    path: [],
    halted: false,
    changes: [],
    drag: [],
    nudge,
    house: null,
  };
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
  return motorwayPath(ctl, drag);
}

function rollback(ctl: Controller, stroke: Stroke): boolean {
  // Undo newest first, so each restore sees the budget, tiles and links it expects.
  for (const c of [...stroke.changes].reverse()) {
    if (c.kind === 'link') {
      unlinkTiles(ctl.sim, c.a, c.b);
    } else if (c.kind === 'motorway') {
      restoreMotorway(ctl.sim, c.motorway);
    } else if (c.kind === 'control') {
      restoreControl(ctl.sim, c.index, c.control);
    } else if (c.kind === 'auto-crossing') {
      for (let k = 1; k < c.path.length; k++) {
        unlinkTiles(ctl.sim, c.path[k - 1], c.path[k]);
      }
      for (const i of c.tiles) releaseCrossingTile(ctl.sim, i);
      removeRoads(ctl.sim, c.added);
    } else if (c.kind === 'unlink') {
      linkTiles(ctl.sim, c.a, c.b);
    } else if (c.kind === 'stub') {
      if (c.from !== undefined) {
        // A paid road the move removed is bought back first, so the stub takes it over again.
        if (c.refunded) placeRoads(ctl.sim, [c.from]);
        moveHouseStub(ctl.sim, c.house, c.from);
        for (const p of c.partners) linkTiles(ctl.sim, c.from, p);
      }
    } else if (c.wasRoad === 0) {
      removeRoads(ctl.sim, [c.index]);
    } else {
      placeRoads(ctl.sim, [c.index]);
      for (const p of c.partners) linkTiles(ctl.sim, c.index, p);
      if (c.crossing) restoreCrossingTile(ctl.sim, c.index, c.crossing);
      for (const m of c.motorways ?? []) restoreMotorway(ctl.sim, m);
      if (c.control) restoreControl(ctl.sim, c.index, c.control);
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
      if (intent.mode === 'motorway' && ctl.motorwayStart) {
        // The second click of a motorway dropped from the dock. A refused end keeps the first.
        const placed = motorwayPath(ctl, [
          ctl.motorwayStart,
          toTile(intent.at),
        ]);
        if (placed) cancelMotorway(ctl);
        return placed;
      }
      // A new stroke commits any unfinished one first.
      const at = toTile(intent.at);
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
        // Anywhere else, a press and drag with the default tool draws road until release.
        ctl.stroke = newStroke('draw');
        ctl.stroke.armedAt = intent.at;
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
      if (current.armedAt) {
        // The drag has begun: lay road from the press, then on to the pointer.
        const from = current.armedAt;
        current.armedAt = null;
        const first = extend(ctl, current, from, toTile, true);
        return extend(ctl, current, intent.at, toTile, false) || first;
      }
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
      // A default-tool click that never moved lays nothing.
      if (stroke?.armedAt) return false;
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
        const changed = extend(ctl, stroke, intent.at, toTile, true);
        if (stroke.pending) {
          // Released over water or mountain: the crossing never reached land, so nothing is built.
          refuseCrossing(ctl, stroke.pending.kind, 'bad-endpoint');
          stroke.pending = null;
        }
        return changed;
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

/** How many tiles a stroke has laid and removed so far, and whether a tile refused it. */
export function strokeTally(stroke: Controller['stroke']): {
  placed: number;
  erased: number;
  halted: boolean;
  motorwaysErased: number;
} {
  if (!stroke) {
    return { placed: 0, erased: 0, halted: false, motorwaysErased: 0 };
  }
  let placed = 0;
  let erased = 0;
  let motorwaysErased = 0;
  for (const change of stroke.changes) {
    if (change.kind === 'motorway') motorwaysErased += 1;
    // Moving a house's stub taps like laying a tile.
    if (change.kind === 'stub') placed += 1;
    // Cutting a stub's link taps like erasing a tile.
    if (change.kind === 'unlink') erased += 1;
    if (change.kind !== 'tile') continue;
    if (change.wasRoad === 0) placed += 1;
    else erased += 1;
  }
  return { placed, erased, halted: stroke.halted, motorwaysErased };
}
