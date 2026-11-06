import { type Car, sendHome, sendHomeAvoiding } from './cars.ts';
import { tuning } from './config.ts';
import type { Building } from './buildings.ts';
import { type Grid, roadLinks } from './grid.ts';
import {
  type LotPoint,
  lotOwnerId,
  lotPath,
  roundedPath,
  spacesFor,
  destinationLot,
  type Inlet,
} from './lots.ts';
import { polylineLength } from './motorways.ts';
import type { SimState } from './sim.ts';

/**
 * Trips through a destination's parking lot (spec: Parking lots, M9a step 2). A car that reaches
 * its destination drives in along the lot's lane to a free space, parks, then drives out and
 * rejoins the road at the lot's node. Only one car at a time may drive in or out of a lot, so two
 * cars never meet on its lane. A car in a lot is off the road: it does not block road tiles, and
 * road cars do not block it.
 *
 * Cars drive on the right of the road, a quarter of a road width from its centre, as drawn. The
 * lot paths start and end in that lane, so a car does not move onto the centre of the road.
 */

/** Where cars drive, from a tile's centre, in tiles: a quarter of a road width, to the right. */
const LANE = 0.125;

/** What a car did on reaching a destination: started its drive in, must wait, or the destination has no lot. */
export type LotStart = 'started' | 'waiting' | 'none';

/** True when no car is driving in or out of the destination's lot, so its lane is free. */
export function laneFree(
  state: SimState,
  destination: number,
  inlet: Inlet,
): boolean {
  return !state.cars.some(
    (c) =>
      c.lot !== undefined &&
      c.lot.destination === destination &&
      c.lot.inlet === inlet &&
      c.lot.phase !== 'parked' &&
      // A car waiting at the lot's edge only to join the road is no longer in the lane.
      !holdingToJoin(c) &&
      // Nor is a queued car once it is past the entrance: it drives straight up the inbound lane, or
      // stands there beside its space, clear of cars turning in or out.
      !clearOfEntrance(c),
  );
}

/** How far past the end of its road approach a queued car must be before it is clear of the entrance. */
const QUEUE_CLEARANCE = 0.75;

/** Whether a queued car has driven past the lot's entrance, where the inbound and outbound lanes meet. */
function clearOfEntrance(c: Car): boolean {
  const lot = c.lot;
  if (lot === undefined || lot.phase !== 'queued') return false;
  if (standingInQueue(c)) return true;
  const approach = lot.approach ? polylineLength(lot.approach) : 0;
  return lot.s >= approach + QUEUE_CLEARANCE;
}

/** Whether a car has driven up to its place in a lot's inbound queue and stands there. */
export function standingInQueue(c: Car): boolean {
  const lot = c.lot;
  return (
    lot !== undefined &&
    lot.phase === 'queued' &&
    lot.s >= (lot.hold ?? 0) - 1e-9
  );
}

/** Whether a car leaving a lot has driven to the lot's edge and waits there for a gap to join the road. */
export function holdingToJoin(c: Car): boolean {
  const lot = c.lot;
  return (
    lot !== undefined &&
    lot.phase === 'out' &&
    lot.cleared !== true &&
    lot.s >= (lot.hold ?? lot.length) - 1e-9
  );
}

/** Whether a building's lot lies on the map. Cached per building, since the lot's geometry is costly to rebuild each tick. */
const lotOnMap = new WeakMap<Building, { key: string; ok: boolean }>();

function hasLotOnMap(grid: Grid, b: Building): boolean {
  const key = `${b.tile}|${b.entrance}|${b.lot ?? 'single'}|${grid.cols}|${grid.rows}`;
  const hit = lotOnMap.get(b);
  if (hit && hit.key === key) return hit.ok;
  const ok = lotPath(grid, b, 0, 'in') !== null;
  lotOnMap.set(b, { key, ok });
  return ok;
}

/**
 * Whether a car leaving a lot has left its space for good: it waits at the lot's edge or is turning on to
 * the road. Its space is free for a car arriving, so a lot whose leavers wait on traffic still takes cars in.
 */
function leftSpace(c: Car): boolean {
  return holdingToJoin(c) || c.lot?.cleared === true;
}

/**
 * True when no car is in the destination's lane at all, including one waiting at the lot's edge to join
 * the road. A car already turning on to the road has left the lane.
 */
function laneEmpty(
  state: SimState,
  destination: number,
  inlet: Inlet,
): boolean {
  return !state.cars.some(
    (c) =>
      c.lot !== undefined &&
      c.lot.destination === destination &&
      c.lot.inlet === inlet &&
      c.lot.phase !== 'parked' &&
      c.lot.cleared !== true &&
      !standingInQueue(c),
  );
}

/** Which inlet a car uses, from the road tile its route reaches the lot by. */
function inletOf(
  state: SimState,
  building: Building,
  node: number | undefined,
): Inlet {
  const lot = destinationLot(state.grid, building);
  return lot?.farRoad !== undefined && lot.farRoad === node ? 'far' : 'near';
}

/** Which spaces of a lot a car is in or driving to, and which have a car queued beside them. */
function lotOccupancy(
  state: SimState,
  owner: number,
  count: number,
  except?: Car,
): { occupied: boolean[]; waiting: boolean[] } {
  const occupied = new Array<boolean>(count).fill(false);
  const waiting = new Array<boolean>(count).fill(false);
  for (const c of state.cars) {
    if (c === except || c.lot === undefined || c.lot.destination !== owner) {
      continue;
    }
    if (c.lot.phase === 'queued') waiting[c.lot.space] = true;
    else if (!leftSpace(c)) occupied[c.lot.space] = true;
  }
  return { occupied, waiting };
}

/**
 * Where a car arriving at a lot goes: the nearest free space it can reach, or, when every space it
 * can reach is taken, a place in the inbound queue beside the deepest of them. A queued car stands
 * in the lane by its space, so spaces beyond it cannot be reached past it, and the queue fills from
 * the deep end. A double lot's far inlet reaches the spaces from the other side and has no queue.
 * Null when the lot can take no more.
 */
function lotPlan(
  state: SimState,
  owner: number,
  count: number,
  inlet: Inlet,
  except?: Car,
): { space: number; queue: boolean } | null {
  const { occupied, waiting } = lotOccupancy(state, owner, count, except);
  if (inlet === 'far') {
    for (let k = 0; k < count; k++) {
      if (!occupied[k] && !waiting[k]) return { space: k, queue: false };
    }
    return null;
  }
  const reach = waiting.indexOf(true) === -1 ? count : waiting.indexOf(true);
  for (let k = 0; k < reach; k++) {
    if (!occupied[k]) return { space: k, queue: false };
  }
  return reach > 0 ? { space: reach - 1, queue: true } : null;
}

/** How far before the turn into its space a queued car stops: clear of the turn's rounding and the out lane. */
const QUEUE_STOP_BACK = 0.35;

/**
 * Where along `path` a car queued for its space stops: just short of the point where the inbound lane
 * turns into the space (`turn`, the lane's last point before the space's centre).
 */
function queueHold(path: readonly LotPoint[], turn: LotPoint): number {
  let s = 0;
  let best = { s: 0, d: Infinity };
  for (let i = 0; i < path.length; i++) {
    if (i > 0) {
      const a = path[i - 1] as LotPoint;
      const b = path[i] as LotPoint;
      s += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const p = path[i] as LotPoint;
    const d = Math.hypot(p.x - turn.x, p.y - turn.y);
    if (d < best.d) best = { s, d };
  }
  return Math.max(0, best.s - QUEUE_STOP_BACK);
}

/** The drive in to space `k`: the road approach, if any, then the lane rounded at its corners. */
function pathToSpace(
  state: SimState,
  building: Building,
  k: number,
  inlet: Inlet,
  approach: LotPoint[] | undefined,
): { path: LotPoint[]; turn: LotPoint } | null {
  const lane = lotPath(state.grid, building, k, 'in', inlet);
  if (lane === null) return null;
  const turn = lane[lane.length - 2] as LotPoint;
  const path = approach
    ? dedupe([...approach, ...roundedPath(lane.slice(1))])
    : roundedPath(lane);
  return { path, turn };
}

/**
 * A queued car whose space has emptied turns in to it, once no other car is driving in the lane. If a
 * deeper space empties first and no car is queued between, it drives on to that one instead.
 */
export function releaseQueued(state: SimState, car: Car): void {
  const lot = car.lot;
  if (!lot || !standingInQueue(car)) return;
  const building = state.buildings[car.destination];
  if (!building) return;
  if (!laneFree(state, lot.destination, lot.inlet)) return;
  const count = spacesFor(building.lot ?? 'single').length;
  const { occupied, waiting } = lotOccupancy(
    state,
    lot.destination,
    count,
    car,
  );
  let target: number | null = occupied[lot.space] ? null : lot.space;
  for (let m = lot.space + 1; target === null && m < count; m++) {
    if (waiting[m]) break;
    if (!occupied[m]) target = m;
  }
  if (target === null) return;
  if (target !== lot.space) {
    const next = pathToSpace(state, building, target, lot.inlet, lot.approach);
    if (next === null) return;
    // The queue stands on the straight inbound lane, which every space's drive shares, so the car's
    // distance along it is the same on the new path.
    lot.path = next.path;
    lot.length = polylineLength(next.path);
    lot.space = target;
  }
  lot.phase = 'in';
  lot.hold = undefined;
}

/** The centre of a tile, in tile units. */
function centreOf(grid: Grid, tile: number): LotPoint {
  return {
    x: (tile % grid.cols) + 0.5,
    y: Math.floor(tile / grid.cols) + 0.5,
  };
}

/** The direction of a step between two adjacent tiles. */
function stepDir(
  grid: Grid,
  from: number,
  to: number,
): { dx: number; dy: number } {
  return {
    dx: (to % grid.cols) - (from % grid.cols),
    dy: Math.floor(to / grid.cols) - Math.floor(from / grid.cols),
  };
}

/** The point in a tile's lane for travel in direction `dir`: the centre, offset to the right of travel. */
function lanePoint(
  grid: Grid,
  tile: number,
  dir: { dx: number; dy: number },
): LotPoint {
  const c = centreOf(grid, tile);
  const len = Math.hypot(dir.dx, dir.dy) || 1;
  return {
    x: c.x + (-dir.dy / len) * LANE,
    y: c.y + (dir.dx / len) * LANE,
  };
}

/** Radius of the turn between the lot's edge and the road's lane, in tiles. */
const TURN_RADIUS = 0.25;
/** How far a lot's node is drawn for a car leaving it, from the centre to the exit edge, in tiles. */
const NODE_DRAWN = 0.5;
/** The furthest into its node a car leaving a lot joins the road, as a share of the half-node drawn past the centre. */
const MAX_JOIN_AT = 0.9;
/** How far inside the lot's edge a leaving car waits for its gap in traffic, in tiles. */
const HOLD_BACK = 0.3;

function dot(a: LotPoint, b: LotPoint): number {
  return a.x * b.x + a.y * b.y;
}

function minus(a: LotPoint, b: LotPoint): LotPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** The unit vector along a step, and the one to its right: the side cars drive on. */
function axes(dir: { dx: number; dy: number }): {
  d: LotPoint;
  n: LotPoint;
} {
  const len = Math.hypot(dir.dx, dir.dy) || 1;
  return {
    d: { x: dir.dx / len, y: dir.dy / len },
    n: { x: -dir.dy / len, y: dir.dx / len },
  };
}

/**
 * The points of a turn from `from` to `to` round `corner`, starting and ending `r` tiles from the corner
 * (less on a shorter leg). Empty when the three points are in line.
 */
function turnRound(
  from: LotPoint,
  corner: LotPoint,
  to: LotPoint,
  r: number,
): LotPoint[] {
  const inLen = Math.hypot(from.x - corner.x, from.y - corner.y);
  const outLen = Math.hypot(to.x - corner.x, to.y - corner.y);
  if (inLen < 1e-6 || outLen < 1e-6) return [];
  const cross =
    (corner.x - from.x) * (to.y - corner.y) -
    (corner.y - from.y) * (to.x - corner.x);
  if (Math.abs(cross) < 1e-9) return [];
  const ri = Math.min(r, inLen);
  const ro = Math.min(r, outLen);
  const a = {
    x: corner.x + ((from.x - corner.x) / inLen) * ri,
    y: corner.y + ((from.y - corner.y) / inLen) * ri,
  };
  const b = {
    x: corner.x + ((to.x - corner.x) / outLen) * ro,
    y: corner.y + ((to.y - corner.y) / outLen) * ro,
  };
  const out: LotPoint[] = [];
  const SAMPLES = 8;
  const square =
    Math.abs(ri - ro) < 1e-9 &&
    Math.abs(
      (a.x - corner.x) * (b.x - corner.x) + (a.y - corner.y) * (b.y - corner.y),
    ) < 1e-9;
  if (square) {
    // A right-angle turn with equal legs is a true quarter circle, so it keeps an even distance from
    // the road's rounded corner. A Bézier through the corner would bulge outward at its middle.
    const o = { x: a.x + b.x - corner.x, y: a.y + b.y - corner.y };
    const u = { x: a.x - o.x, y: a.y - o.y };
    const w = { x: b.x - o.x, y: b.y - o.y };
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const vx = (1 - t) * u.x + t * w.x;
      const vy = (1 - t) * u.y + t * w.y;
      const len = Math.hypot(vx, vy);
      out.push({ x: o.x + (vx / len) * ri, y: o.y + (vy / len) * ri });
    }
    return out;
  }
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const v = 1 - t;
    out.push({
      x: v * v * a.x + 2 * v * t * corner.x + t * t * b.x,
      y: v * v * a.y + 2 * v * t * corner.y + t * t * b.y,
    });
  }
  return out;
}

/** A path without repeated points. */
function dedupe(points: LotPoint[]): LotPoint[] {
  return points.filter(
    (p, i) =>
      i === 0 ||
      Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-9,
  );
}

/** Whether `other` is a car on its way into the lot at `node`: it has driven onto the node and not yet started (not `car`). */
function waitingNear(other: Car, node: number | undefined, car: Car): boolean {
  return (
    other !== car &&
    other.state === 'driving' &&
    other.lot === undefined &&
    other.entering === true &&
    other.route[other.route.length - 1] === node
  );
}

/** Whether a tile holds one car at a time: a light, or a junction. */
function holdsAlone(state: SimState, tile: number): boolean {
  return (
    state.controls[tile] === 'light' ||
    roadLinks(state.roads, state.links, tile).length >=
      tuning.JUNCTION_MIN_ROADS
  );
}

/**
 * Whether a car at the end of the tile before its destination's node may enter that node now. Only one car
 * at a time may be on the node, and only when its lane is free and a space is left after reserving spaces
 * for the cars already on the way in. A car that has to wait waits on the road, so the node stays clear.
 */
export function lotGateOpen(state: SimState, car: Car): boolean {
  if (car.state !== 'driving' || car.lot !== undefined) return true;
  // The gate is checked when the car drives onto its node, and one tile earlier when that tile is a
  // junction or light, so a car never waits for its lot on a tile that holds other traffic.
  const into = car.progress + 1;
  const last = car.route.length - 1;
  const earlier =
    into === last - 1 && holdsAlone(state, car.route[into] as number);
  if (into !== last && !earlier) return true;
  const node = car.route[last];
  if (node === undefined) return true;
  const building = state.buildings[car.destination];
  if (!building || !hasLotOnMap(state.grid, building)) return true;
  const owner = lotOwnerId(building);
  const inlet = inletOf(state, building, node);
  if (!laneFree(state, owner, inlet)) return false;
  const onNode = state.cars.some((c) => waitingNear(c, node, car));
  if (onNode) return false;
  const count = spacesFor(building.lot ?? 'single').length;
  // A free space it can reach, or a place in the inbound queue. A car waiting at the lot's edge to
  // leave has given its space up.
  return lotPlan(state, owner, count, inlet, car) !== null;
}

/** How far along a lot approach a car is when the sim takes over from the road: one tile. */
export const APPROACH_HANDOFF = 1;
/**
 * From a roundabout, how far along the approach the sim takes over, in tiles. The ring covers the node's
 * first half and leaves the car at its centre, so the view draws the second half, from the start of the
 * approach, and the sim takes over half a tile along it.
 */
export const RING_APPROACH_HANDOFF = 0.5;
/** How far along its lane a car runs, at least, as it turns between a roundabout's edge and a lot, in tiles. */
const RING_TURN_LEAD = 0.15;

/** A quadratic curve from `a` to `b` with control point `c`, as points, ends included. */
function bezier(a: LotPoint, c: LotPoint, b: LotPoint): LotPoint[] {
  const out: LotPoint[] = [];
  const SAMPLES = 8;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const v = 1 - t;
    out.push({
      x: v * v * a.x + 2 * v * t * c.x + t * t * b.x,
      y: v * v * a.y + 2 * v * t * c.y + t * t * b.y,
    });
  }
  return out;
}

/**
 * The path a car drives from the centre of the tile before a lot's access node to the lot's edge, in tile
 * units. It keeps its lane, then turns on the road's rounded corner from the tile's entry edge to the
 * inlet's lane, so it never runs on past the corner or pivots back. The view draws a car's last road tile along
 * this path, and the sim takes over at APPROACH_HANDOFF, so the car never jumps. Null when the lot is
 * off the map.
 */
export function lotApproach(
  grid: Grid,
  building: Building,
  inlet: Inlet,
  prev: number,
  node: number,
  fromRing = false,
): LotPoint[] | null {
  const lane = lotPath(grid, building, 0, 'in', inlet);
  const tab = lane?.[1];
  if (!tab) return null;
  const dir = stepDir(grid, prev, node);
  const nodeLane = lanePoint(grid, node, dir);
  const before = lanePoint(grid, prev, dir);
  const { d } = axes(dir);
  const t = dot(minus(tab, nodeLane), d);
  if (fromRing) {
    // Off a roundabout the car starts at the node's centre, where the ring leaves it, and runs on in its lane
    // into the inlet: straight on, or curving into its lane from there.
    const lead = Math.max(RING_TURN_LEAD, t);
    const control = { x: nodeLane.x + d.x * lead, y: nodeLane.y + d.y * lead };
    return dedupe(bezier(nodeLane, control, tab));
  }
  const corner = { x: nodeLane.x + d.x * t, y: nodeLane.y + d.y * t };
  // The car turns on a circle tangent to its lane and the inlet's lane, starting at the tile's entry edge.
  // That circle is the road's own rounded corner, in the car's lane: half a tile less the lane for a lot on
  // the car's side, and half a tile plus it for a lot across the road.
  const radius = Math.max(0.05, 0.5 + t);
  return dedupe([before, ...turnRound(before, corner, tab, radius), tab]);
}

/**
 * Starts a car's drive into its destination's lot. The car stays on the road, waiting at the
 * node, until the lane is free and a space is open. The drive starts on the car's lane of the
 * tile it came from, and turns off its lane into the inlet.
 */
export function startLotTrip(state: SimState, car: Car): LotStart {
  const building = state.buildings[car.destination];
  if (!building || !hasLotOnMap(state.grid, building)) {
    return 'none';
  }
  // A double lot's two buildings share one lane and one set of spaces, so the lot's owner keys them.
  const owner = lotOwnerId(building);
  const inlet = inletOf(state, building, car.route[car.progress]);
  if (!laneFree(state, owner, inlet)) return 'waiting';
  const plan = lotPlan(
    state,
    owner,
    spacesFor(building.lot ?? 'single').length,
    inlet,
  );
  if (plan === null) return 'waiting';
  const node = car.route[car.progress];
  const prev = car.progress > 0 ? car.route[car.progress - 1] : undefined;
  let approach: LotPoint[] | undefined;
  let s = 0;
  if (node !== undefined && prev !== undefined) {
    const fromRing = state.controls[prev] === 'roundabout';
    approach =
      lotApproach(state.grid, building, inlet, prev, node, fromRing) ??
      undefined;
    if (approach === undefined) return 'none';
    // The car is where the view drew it at the end of its last road tile: one tile along the approach, or
    // half a tile off a roundabout, whose ring covers the node's first half.
    s = fromRing ? RING_APPROACH_HANDOFF : APPROACH_HANDOFF;
  }
  const drive = pathToSpace(state, building, plan.space, inlet, approach);
  if (drive === null) return 'none';
  car.lot = {
    destination: owner,
    space: plan.space,
    inlet,
    phase: plan.queue ? 'queued' : 'in',
    path: drive.path,
    s,
    length: polylineLength(drive.path),
    approach,
    // A queued car drives up the inbound lane and stops beside its space until the space is free.
    hold: plan.queue ? queueHold(drive.path, drive.turn) : undefined,
  };
  return 'started';
}

/**
 * Starts a parked car's drive out of its space, back to the road node. The drive ends in the lane
 * of the first road tile on the way home. Returns false while the lane is in use, and the car
 * keeps waiting in its space.
 */
export function startLotExit(state: SimState, car: Car): boolean {
  const lot = car.lot;
  if (!lot || !laneEmpty(state, lot.destination, lot.inlet)) return false;
  // A car already on the node is on its way in and would be left waiting behind this one, so the exit waits.
  const node = car.route[car.progress];
  if (state.cars.some((c) => waitingNear(c, node, car))) {
    return false;
  }
  lot.phase = 'out';
  lot.s = 0;
  lot.cleared = undefined;
  lot.avoid = undefined;
  planExit(state, car, exitRoute(state, car));
  return true;
}

/**
 * The route home of a car leaving a lot: the quickest, unless it has given up on the way it first meant
 * to leave, as that lane stayed jammed, and then one that leaves the node another way where there is one.
 */
export function exitRoute(state: SimState, car: Car): Car | null {
  const avoid = car.lot?.avoid;
  return avoid === undefined
    ? sendHome(state, car)
    : sendHomeAvoiding(state, car, avoid);
}

/**
 * Plans a leaving car's drive from its space to the road, for its route home `home`. The car leaves by the
 * inlet's centre, waits just inside the lot's edge for a gap, then turns into its lane along the road's
 * rounded corner, joining the road just inside the node's far edge, facing the way it will drive. Cars driving in cross the edge either side of the centre, ahead of
 * where they stop, so they pass a car waiting to leave. Planned again if its route home changes direction
 * while it waits, from where it has got to.
 */
function planExit(state: SimState, car: Car, home: Car | null): void {
  const lot = car.lot;
  if (!lot) return;
  const building = state.buildings[lot.destination];
  const from = home?.route[0];
  const to = home?.route[1];
  let path: LotPoint[] = [];
  let hold: number | undefined;
  let crosses = false;
  let joinAt = 0;
  if (building && from !== undefined && to !== undefined) {
    const dir = stepDir(state.grid, from, to);
    const end = lanePoint(state.grid, from, dir);
    const lane = lotPath(state.grid, building, lot.space, 'out', lot.inlet);
    if (lane) {
      const body = roundedPath(lane.slice(0, -1));
      const edge = body[body.length - 1];
      const { d, n } = axes(dir);
      const ahead = dot(minus(edge, end), d);
      const side = dot(minus(edge, end), n);
      if (state.controls[to] === 'roundabout') {
        // A roundabout's ring starts at this node's centre, so the car drives from the lot's edge into its lane
        // there, and joins the road at the ring's edge, ready to go round.
        const lead = Math.max(RING_TURN_LEAD, -ahead);
        const control = { x: end.x - d.x * lead, y: end.y - d.y * lead };
        path = dedupe([
          ...body,
          ...(Math.abs(side) > 1e-6 ? bezier(edge, control, end) : []),
          end,
        ]);
        joinAt = 1;
        hold = Math.max(0, polylineLength(body) - HOLD_BACK);
        const centre = centreOf(state.grid, from);
        crosses = dot(minus(edge, centre), n) < 0;
        lot.path = path;
        lot.length = polylineLength(path);
        lot.hold = hold;
        lot.crosses = crosses;
        lot.joinAt = joinAt;
        lot.toward = to;
        lot.s = Math.min(lot.s, hold);
        return;
      }
      let corner = end;
      let radius = TURN_RADIUS;
      if (Math.abs(side) > 1e-6) {
        // The road runs past the lot, so the node is a bend. The car turns from the lot's edge on a circle
        // tangent to the inlet's lane and its own: the road's rounded corner, in its lane. The circle is cut
        // a little short so the turn ends just inside the node's far edge, where the car joins the road.
        corner = { x: end.x + d.x * ahead, y: end.y + d.y * ahead };
        radius = Math.max(
          0.05,
          Math.min(Math.abs(side), MAX_JOIN_AT * NODE_DRAWN - ahead),
        );
      }
      // On a road running straight on from the inlet the car drives into its lane, past the node's centre.
      const finish = {
        x: corner.x + d.x * radius,
        y: corner.y + d.y * radius,
      };
      joinAt = Math.min(
        MAX_JOIN_AT,
        Math.max(0, dot(minus(finish, end), d) / NODE_DRAWN),
      );
      path = dedupe([
        ...body,
        ...turnRound(edge, corner, finish, radius),
        finish,
      ]);
      hold = Math.max(0, polylineLength(body) - HOLD_BACK);
      // The lot is on the far side of the road from the car's lane, so the turn crosses the other lane.
      const centre = centreOf(state.grid, from);
      crosses = dot(minus(edge, centre), n) < 0;
    }
  } else if (building) {
    const lane = lotPath(state.grid, building, lot.space, 'out', lot.inlet);
    if (lane) path = roundedPath(lane);
  }
  lot.path = path;
  lot.length = polylineLength(path);
  lot.hold = hold;
  lot.crosses = crosses;
  lot.joinAt = joinAt;
  lot.toward = to;
  lot.s = Math.min(lot.s, hold ?? lot.length);
}

/**
 * Brings a leaving car's planned turn on to the road up to date with its route home `home`: when the route
 * now leaves the node another way, the turn is planned again. Only before the car has started its turn.
 */
export function replanExit(state: SimState, car: Car, home: Car | null): void {
  const lot = car.lot;
  if (!lot || lot.phase !== 'out' || lot.cleared === true) return;
  if (home?.route[1] === lot.toward) return;
  planExit(state, car, home);
}

/** Moves a car driving in or out of its lot along the lane, by one tick. Parked cars stay put. */
export function advanceLot(car: Car): void {
  const lot = car.lot;
  if (!lot || lot.phase === 'parked') return;
  const step = tuning.CAR_SPEED / tuning.TICKS_PER_SECOND;
  // On the way out the car stops at the lot's edge until the road is clear for it.
  const stop =
    (lot.phase === 'out' && lot.cleared !== true) || lot.phase === 'queued'
      ? (lot.hold ?? lot.length)
      : lot.length;
  lot.s = Math.min(stop, lot.s + step);
}
