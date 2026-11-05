import { accessTiles, type Building, buildingCentre } from './buildings.ts';
import type { Car } from './cars.ts';
import { tuning } from './config.ts';
import { DIAGONAL_STEP, type Grid, isDiagonal, roadLinks } from './grid.ts';
import { laneHasGreen, roundaboutPath } from './controls.ts';
import { motorwayBetween, polylineLength } from './motorways.ts';
import { advanceLot, lotGateOpen } from './lot-trips.ts';
import type { SimState } from './sim.ts';

/**
 * Car movement along routes (spec: Cars and routing, Movement and queuing).
 *
 * Roads are two lanes, and cars keep to the right. A car's lane is the direction it
 * is travelling in on its current tile, so cars going the same way share a lane and
 * opposite traffic never blocks it. A car's `along` is how far it has moved into its tile.
 * - A car stops `CAR_GAP` short of the car ahead of it in its lane.
 * - A car may enter a tile only when no car in its lane there is closer than `CAR_GAP`
 *   to the entrance.
 * - A junction holds one car at a time, whatever the lane. A car already on it blocks everyone.
 * - Cars move front-first, so a follower sees where its leader has got to this tick.
 */

const EPSILON = 1e-9;

/** Lane code for "no direction known". */
const NO_LANE = 9;

/** Whether a tile is where a destination's lot meets the road. */
function isLotNode(state: SimState, tile: number): boolean {
  return state.buildings.some(
    (b) =>
      b.kind === 'destination' && accessTiles(state.grid, b).includes(tile),
  );
}

function isJunction(state: SimState, tile: number): boolean {
  return (
    roadLinks(state.roads, state.links, tile).length >=
    tuning.JUNCTION_MIN_ROADS
  );
}

/** A small code for the direction of a step between two adjacent tiles. */
function stepCode(grid: Grid, from: number, to: number): number {
  const dx = Math.sign((to % grid.cols) - (from % grid.cols));
  const dy = Math.sign(
    Math.floor(to / grid.cols) - Math.floor(from / grid.cols),
  );
  return (dx + 1) * 3 + (dy + 1);
}

/**
 * The lane a car is in on its current tile: the direction it came in by. A car on its
 * first tile, with no tile behind it, uses the direction it will leave by.
 */
export function laneOfRoute(
  grid: Grid,
  route: readonly number[],
  progress: number,
): number {
  if (progress > 0) return stepCode(grid, route[progress - 1], route[progress]);
  if (progress < route.length - 1)
    return stepCode(grid, route[progress], route[progress + 1]);
  return NO_LANE;
}

export function laneOf(grid: Grid, car: Car): number {
  return laneOfRoute(grid, car.route, car.progress);
}

/** The budget a step costs: a motorway's curve over MOTORWAY_SPEED, or 1 for a ground step (DIAGONAL_STEP across a corner). */
function stepLength(state: SimState, a: number, b: number): number {
  const m = motorwayBetween(state.motorways, a, b);
  if (m) return m.length / tuning.MOTORWAY_SPEED;
  return isDiagonal(state.grid, a, b) ? DIAGONAL_STEP : 1;
}

/**
 * Length of the step the car is on, in budget units: the step out of its tile, or into it on
 * the last tile. On the last tile a motorway arrival costs 1, since the ride was paid on the
 * tile before it.
 *
 * A tile reached by motorway is drawn only from its centre to its exit edge, half a tile, so
 * its step out costs half a ground step. That keeps the car's drawn speed even across the ramp.
 */
function segmentLength(state: SimState, car: Car): number {
  const { route, progress } = car;
  // A destination's lot node is drawn over half a tile on its road side, so its steps cost half.
  if (progress === 0 && route.length > 1 && isLotNode(state, route[0])) {
    return 0.5;
  }
  if (progress < route.length - 1) {
    if (progress > 0 && state.controls[route[progress]] === 'roundabout') {
      // Across a roundabout the car drives round the ring, so its step costs that path.
      return polylineLength(
        roundaboutPath(
          state.grid,
          route[progress - 1],
          route[progress],
          route[progress + 1],
        ),
      );
    }
    const a = route[progress];
    const b = route[progress + 1];
    const arrivedByMotorway =
      progress > 0 &&
      motorwayBetween(state.motorways, route[progress - 1], a) !== null;
    const leavesByMotorway = motorwayBetween(state.motorways, a, b) !== null;
    // The curve already reaches this tile's exit edge, so the tile is passed at once.
    if (arrivedByMotorway && !leavesByMotorway) return 0;
    return stepLength(state, a, b);
  }
  if (progress > 0) {
    const a = route[progress - 1];
    const b = route[progress];
    if (isLotNode(state, b)) return 0.5;
    return motorwayBetween(state.motorways, a, b) ? 1 : stepLength(state, a, b);
  }
  return 1;
}

/** How far a turn is drawn across its tile, in tiles: a quarter of a curve from one edge to the other. */
const TURN_DRAWN_TILES = 0.8;

/**
 * How far, in tiles, a car's current tile is drawn, so `along` spacing can be measured as
 * distance. A straight tile is one tile; a turn is shorter; the last tile is drawn only to the
 * building's centre; a roundabout is its ring.
 */
function drawnTiles(state: SimState, car: Car): number {
  const { route, progress } = car;
  if (progress === 0) return 1;
  if (progress >= route.length - 1) return 0.5;
  const tile = route[progress];
  if (state.controls[tile] === 'roundabout') {
    return polylineLength(
      roundaboutPath(
        state.grid,
        route[progress - 1],
        tile,
        route[progress + 1],
      ),
    );
  }
  const turns =
    stepCode(state.grid, route[progress - 1], tile) !==
    stepCode(state.grid, tile, route[progress + 1]);
  return turns ? TURN_DRAWN_TILES : 1;
}

/** The gap a car keeps behind another, in `along` units: CAR_GAP tiles of drawn road. */
function gapAlong(state: SimState, car: Car): number {
  return tuning.CAR_GAP / drawnTiles(state, car);
}

/** How far along its current tile the car may move, given the cars ahead of it in its lane. */
function roomAhead(state: SimState, car: Car): number {
  const tile = car.route[car.progress];
  const lane = laneOf(state.grid, car);
  let room = 1;
  const mine = drawnTiles(state, car);
  for (const d of state.cars) {
    if (d === car || d.lot !== undefined || d.route[d.progress] !== tile)
      continue;
    if (laneOf(state.grid, d) !== lane) continue;
    const ahead =
      d.along > car.along || (d.along === car.along && d.id < car.id);
    if (!ahead) continue;
    // The gap is in drawn distance, so use the shorter of the two tiles' drawn lengths.
    const gap = tuning.CAR_GAP / Math.min(mine, drawnTiles(state, d));
    room = Math.min(room, d.along - gap);
  }
  // A car on the next tile in the same lane also limits how close this car may get to the
  // edge, so the two keep CAR_GAP of drawn road between them across the join.
  const next = car.route[car.progress + 1];
  if (next !== undefined) {
    const into = stepCode(state.grid, tile, next);
    for (const d of state.cars) {
      if (d === car || d.lot !== undefined || d.route[d.progress] !== next)
        continue;
      if (laneOf(state.grid, d) !== into) continue;
      const short = tuning.CAR_GAP - d.along * drawnTiles(state, d);
      room = Math.min(room, 1 - short / mine);
    }
  }
  return Math.max(0, room);
}

/**
 * Whether `tile` can take a car arriving in `lane` now. `mover` is the car asking, which
 * is ignored when counting cars already there. A `lane` of null means any lane, which is
 * used for a car that has not yet got a direction (a new spawn).
 */
/** A tile where a road turns: its two links are not on opposite sides. Cars in opposite lanes cross at its centre. */
function isCorner(state: SimState, tile: number): boolean {
  const links = roadLinks(state.roads, state.links, tile);
  if (links.length !== 2) return false;
  const { cols } = state.grid;
  const x = (t: number) => t % cols;
  const y = (t: number) => Math.floor(t / cols);
  return (
    x(links[0]) + x(links[1]) !== 2 * x(tile) ||
    y(links[0]) + y(links[1]) !== 2 * y(tile)
  );
}

export function tileOpen(
  state: SimState,
  tile: number,
  mover: Car | null,
  lane: number | null,
): boolean {
  const control = state.controls[tile];
  if (control === 'light' && lane !== null && !laneHasGreen(state, lane)) {
    return false;
  }
  const junction = isJunction(state, tile);
  // A junction or a light holds one car at a time, whatever the lane.
  const single = junction || control === 'light';
  let here = 0;
  for (const d of state.cars) {
    if (d === mover || d.lot !== undefined || d.route[d.progress] !== tile)
      continue;
    // A car waiting on its destination's last tile for a lot space does not hold the tile: a car
    // leaving that lot needs the node, and the waiting car needs that lot's lane.
    if (
      d.state === 'driving' &&
      d.progress === d.route.length - 1 &&
      d.along >= 1 - EPSILON
    ) {
      continue;
    }
    if (control === 'roundabout') {
      // A roundabout takes any car that has a gap at its entrance, up to its capacity.
      here += 1;
      if (d.along < gapAlong(state, d)) return false;
      continue;
    }
    if (single) return false;
    if (lane !== null && laneOf(state.grid, d) !== lane) continue;
    if (d.along < gapAlong(state, d)) return false;
  }
  if (control === 'roundabout' && here >= tuning.ROUNDABOUT_CAPACITY) {
    return false;
  }
  return true;
}

/**
 * Where a car may join the road on `tile` from a house, a lot or a parking space, in `lane` (null for any):
 * the position along the tile that keeps CAR_GAP drawn road behind any car about to drive onto it, or null
 * when the tile is occupied in that lane. A joining car never waits for traffic to pass, so it cannot deadlock.
 */
export function joinAlong(
  state: SimState,
  tile: number,
  mover: Car | null,
  lane: number | null,
): number | null {
  if (!tileOpen(state, tile, mover, lane)) return null;
  if (
    lane !== null &&
    state.controls[tile] === undefined &&
    isCorner(state, tile)
  ) {
    // On a turn, a car in the other lane crosses the joining car's path at the centre.
    for (const d of state.cars) {
      if (d === mover || d.lot !== undefined || d.route[d.progress] !== tile)
        continue;
      if (laneOf(state.grid, d) !== lane) return null;
    }
  }
  let along = 0;
  for (const d of state.cars) {
    if (d === mover || d.lot !== undefined) continue;
    if (d.progress >= d.route.length - 1 || d.route[d.progress + 1] !== tile)
      continue;
    if (
      lane !== null &&
      stepCode(state.grid, d.route[d.progress], tile) !== lane
    )
      continue;
    // Its distance to the joining point: the rest of its tile, then the start of this one, which is drawn whole.
    const need = tuning.CAR_GAP - (1 - d.along) * drawnTiles(state, d);
    along = Math.max(along, need);
  }
  return along < 1 ? along : null;
}

/** Where cars drive, from a tile's centre, in tiles: to the right of travel, as drawn. */
const LANE = 0.125;

/** How far into a straight tile its centre is, in tiles: where a car joining the road reaches its lane. */
const HALF = 0.5;

/**
 * Whether a house on `tile` lies across the other lane from a car travelling from `tile` toward
 * `toward` (or, with `from`, into `tile` from `from`): reaching it, or leaving it, crosses that lane.
 */
export function houseAcross(
  state: SimState,
  house: Building,
  tile: number,
  step: { from: number; to: number },
): boolean {
  const { cols } = state.grid;
  const dx = (step.to % cols) - (step.from % cols);
  const dy = Math.floor(step.to / cols) - Math.floor(step.from / cols);
  const len = Math.hypot(dx, dy) || 1;
  const h = buildingCentre(state.grid, house);
  const cx = (tile % cols) + 0.5;
  const cy = Math.floor(tile / cols) + 0.5;
  // The right of travel is (-dy, dx); a house on the left is across the other lane.
  return (h.x - cx) * (-dy / len) + (h.y - cy) * (dx / len) < -1e-6;
}

/** How far a house is from where a car meets its lane at the access tile's centre, in tiles. */
export function houseLeg(
  state: SimState,
  house: Building,
  tile: number,
  step: { from: number; to: number },
): number {
  const { cols } = state.grid;
  const dx = (step.to % cols) - (step.from % cols);
  const dy = Math.floor(step.to / cols) - Math.floor(step.from / cols);
  const len = Math.hypot(dx, dy) || 1;
  const h = buildingCentre(state.grid, house);
  const lx = (tile % cols) + 0.5 + (-dy / len) * LANE;
  const ly = Math.floor(tile / cols) + 0.5 + (dx / len) * LANE;
  return Math.hypot(h.x - lx, h.y - ly);
}

/**
 * Whether car `d`, in the lane a joining or turning car must cross, is in the way of that crossing at `at`
 * tiles into the tile, measured along `d`'s own direction. It is in the way when it is within CAR_GAP of the
 * crossing point, or still moving toward it and would reach it within `lead` and CAR_GAP. A car stopped in a
 * queue clear of the crossing point does not hold it, as in traffic that leaves a gap for a turning car.
 */
function inCrossing(
  state: SimState,
  d: Car,
  at: number,
  lead: number,
  onTile: boolean,
  patient = false,
): boolean {
  const drawn = drawnTiles(state, d);
  const p = onTile ? d.along * drawn : -(1 - d.along) * drawn;
  const dist = at - p;
  const moving = onTile
    ? roomAhead(state, d) > d.along + EPSILON
    : canReach(state, d);
  // A patient car no longer waits for a stopped queue across its path: in a jam that queue may be waiting
  // on this car's space, so it noses through rather than hold the jam for ever.
  if (Math.abs(dist) < tuning.CAR_GAP) return moving || !patient;
  if (dist <= 0) return false;
  return moving && dist < tuning.CAR_GAP + lead;
}

/**
 * Whether a car about to drive on to the next tile can get there now: it is not held at its lot's gate, no
 * car ahead of it in its lane stops it short of the tile's end, and, once at the end, the next tile has room. A car queued behind a held one is not
 * waited for by a car joining the road, since the queue may be waiting for the joining car's space.
 */
function canReach(state: SimState, d: Car): boolean {
  if (!lotGateOpen(state, d)) return false;
  const room = roomAhead(state, d);
  if (room < 1 - EPSILON) return false;
  if (d.along < 1 - EPSILON) return true;
  // At the tile's end it is waiting to drive on, and gets there only once that tile has room for it.
  const tile = d.route[d.progress];
  const next = d.route[d.progress + 1];
  return (
    next === undefined ||
    tileOpen(state, next, d, stepCode(state.grid, tile, next))
  );
}

/**
 * How long a joining car has waited: 0 at first; 1 once patient, when it stops waiting for stopped traffic
 * across its path and for cars still to drive on; 2 once forced, in gridlock, when it also merges into a
 * stopped queue in its own lane, as that queue may be waiting on this car's space.
 */
export type Patience = 0 | 1 | 2;

/**
 * Whether a car may join the road on `tile`, heading for `to`, from a house, a lot or a kerb. It meets its
 * lane `past` tiles beyond the tile's centre, after a drive of `lead` tiles from where it waits.
 * - Its lane must have CAR_GAP clear ahead of that point, and no car behind it on the tile.
 * - No car may be closing on that point in its lane within the drive and CAR_GAP.
 * - When the drive crosses the other lane, `crossAt` tiles into the tile along that lane, no car in that
 *   lane may be in the way of the crossing (see `inCrossing`).
 * - With `patience` it gives way less, so a jam cannot hold it for ever (see `Patience`).
 * A car that cannot reach the tile now, held at its lot's gate or queued behind a car that is, is not waited
 * for: it may be waiting on space this car holds.
 */
export function joinClear(
  state: SimState,
  tile: number,
  to: number,
  mover: Car | null,
  crossAt: number | null,
  lead: number,
  patience: Patience = 0,
  past = 0,
): boolean {
  const own = stepCode(state.grid, tile, to);
  const patient = patience >= 1;
  const forced = patience >= 2;
  // Where the car meets its lane, from the tile's entry edge, in drawn tiles.
  const meet = HALF + past;
  // A tile that holds one car at a time is never pushed into.
  const single = isJunction(state, tile) || state.controls[tile] !== undefined;
  if (!tileOpen(state, tile, mover, own) && (!forced || single)) return false;
  // On a turn, a car in the other lane crosses the joining car's path at the centre.
  const corner = state.controls[tile] === undefined && isCorner(state, tile);
  for (const d of state.cars) {
    if (d === mover) continue;
    if (d.lot !== undefined) {
      // A car already turning out of a lot on to this tile has the gap this car would take.
      if (d.lot.cleared === true && d.route[d.progress] === tile) return false;
      continue;
    }
    if (d.route[d.progress] !== tile) continue;
    const last = d.progress === d.route.length - 1;
    const mine =
      d.route[d.progress + 1] === to || (last && laneOf(state.grid, d) === own);
    if (mine) {
      if (d.along * drawnTiles(state, d) < meet + tuning.CAR_GAP) {
        // In gridlock a forced car merges into a stopped queue; it never cuts in on moving traffic.
        const stopped = roomAhead(state, d) <= d.along + EPSILON;
        if (!(forced && stopped)) return false;
      }
    } else if (d.state === 'parked') {
      continue;
    } else if (corner) {
      return false;
    } else if (
      crossAt !== null &&
      inCrossing(state, d, crossAt, lead, true, patient)
    ) {
      return false;
    }
  }
  for (const d of state.cars) {
    if (d === mover || d.lot !== undefined) continue;
    if (d.progress >= d.route.length - 1 || d.route[d.progress + 1] !== tile)
      continue;
    if (!canReach(state, d)) continue;
    const left = (1 - d.along) * drawnTiles(state, d);
    const last = d.progress + 1 === d.route.length - 1;
    const mine =
      d.route[d.progress + 2] === to ||
      (last && stepCode(state.grid, d.route[d.progress], tile) === own);
    if (mine) {
      if (left < tuning.CAR_GAP || left + meet < tuning.CAR_GAP + lead) {
        return false;
      }
    } else if (
      crossAt !== null &&
      !patient &&
      inCrossing(state, d, crossAt, lead, false)
    ) {
      return false;
    }
  }
  return true;
}

/** How long a car arriving home waits to turn across the other lane before it goes anyway, so two waits cannot lock. */
const CROSS_PATIENCE = tuning.TICKS_PER_SECOND * 5;

/** Corner radius of the drawn turn into a house, in tiles, and how much shorter the curve is than its two legs. */
const HOUSE_TURN = 0.25;
const HOUSE_TURN_SAVING = 0.852 * HOUSE_TURN;

/**
 * Where a car arriving home stops, as a fraction of its last tile, before it turns across the other lane
 * to its house: just before its drawn turn begins. Null when its house is on its own side of the road.
 */
function crossingStop(state: SimState, car: Car): number | null {
  const { route, progress } = car;
  if (car.state !== 'returning' || progress === 0) return null;
  if (progress !== route.length - 1) return null;
  const house = state.buildings[car.house];
  if (!house || house.kind !== 'house') return null;
  const tile = route[progress];
  const step = { from: route[progress - 1], to: tile };
  if (!houseAcross(state, house, tile, step)) return null;
  const total = HALF + houseLeg(state, house, tile, step) - HOUSE_TURN_SAVING;
  return Math.max(0, (HALF - HOUSE_TURN - 0.05) / total);
}

/** Whether the other lane is in the way of a car about to turn across it to its house. */
function crossBlocked(state: SimState, car: Car): boolean {
  const tile = car.route[car.progress];
  const prev = car.route[car.progress - 1];
  for (const d of state.cars) {
    if (d === car || d.lot !== undefined || d.state === 'parked') continue;
    if (d.route[d.progress] === tile) {
      if (laneOf(state.grid, d) === laneOf(state.grid, car)) continue;
      // Two cars waiting to cross each other's lane: the lower id goes first.
      const stop = crossingStop(state, d);
      if (stop !== null && d.along >= stop - EPSILON && d.id > car.id) continue;
      if (inCrossing(state, d, HALF, HALF, true)) return true;
      continue;
    }
    if (d.progress >= d.route.length - 1 || d.route[d.progress + 1] !== tile)
      continue;
    if (d.route[d.progress] === prev) continue;
    if (!canReach(state, d)) continue;
    if (inCrossing(state, d, HALF, HALF, false)) return true;
  }
  return false;
}

/** Whether a car may not enter `next` yet, because the tile after it, on its route, has no room in its lane. */
function boxBlocked(state: SimState, car: Car, next: number): boolean {
  const single = isJunction(state, next) || state.controls[next] === 'light';
  if (!single) return false;
  const after = car.route[car.progress + 2];
  if (after === undefined) return false;
  return !tileOpen(state, after, car, stepCode(state.grid, next, after));
}

/** Moves one car as far as its budget and the cars around it allow this tick. Parked cars stay put. */
function advance(state: SimState, car: Car): void {
  if (car.state === 'parked') return;
  let budget = tuning.CAR_SPEED / tuning.TICKS_PER_SECOND;
  // A car turning across the other lane to its house waits short of the turn until that lane is clear.
  let cap = 1;
  const stop = crossingStop(state, car);
  if (
    stop !== null &&
    car.along <= stop + EPSILON &&
    (car.waited ?? 0) < CROSS_PATIENCE &&
    crossBlocked(state, car)
  ) {
    cap = stop;
    if (car.along >= stop - EPSILON) car.waited = (car.waited ?? 0) + 1;
  }
  while (budget > EPSILON) {
    const room = Math.min(roomAhead(state, car), cap);
    if (car.along < room) {
      const length = segmentLength(state, car);
      const step = Math.min(budget / length, room - car.along);
      car.along += step;
      budget -= step * length;
      continue;
    }
    // At the end of what it may do on this tile.
    const last = car.progress >= car.route.length - 1;
    if (last || room < 1) return;
    const next = car.route[car.progress + 1];
    const lane = stepCode(state.grid, car.route[car.progress], next);
    if (!lotGateOpen(state, car) || !tileOpen(state, next, car, lane)) return;
    // Box rule: a car enters a junction or light only if it can also leave it, so two junctions
    // can never each hold a car that needs the other's tile.
    if (boxBlocked(state, car, next)) return;
    car.progress += 1;
    car.along = 0;
    // Onto its destination's node: a car on its way into the lot, which holds the node until it starts.
    if (car.progress === car.route.length - 1) car.entering = true;
  }
}

/** Moves every car one tick along its route. Deterministic: front cars move first, then by id. */
export function moveCars(state: SimState): void {
  const order = [...state.cars].sort(
    (a, b) => b.progress + b.along - (a.progress + a.along) || a.id - b.id,
  );
  for (const car of order) {
    if (car.lot) advanceLot(car);
    else advance(state, car);
  }
}
