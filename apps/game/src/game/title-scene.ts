import {
  chooseOffer,
  createGrid,
  createSim,
  linkTiles,
  lotAt,
  lotBlocker,
  nextFloat,
  placeBuilding,
  placeRoads,
  reservedLotTiles,
  Terrain,
  tuning,
  unclaimedPins,
  type MapRule,
  type Side,
  type SimState,
} from '@overpass-game/sim';
import {
  BASE_PALETTE_IDS,
  type BasePaletteId,
} from '@overpass-game/render-style';

/**
 * The start screen's backdrop: a squared-oval loop of road with one business and 1 to 5 houses on
 * it. It runs on the real sim and is drawn by the game's own renderer, behind the menu's frosted
 * layer. Nothing spawns, offers are taken as they come, and the business keeps a couple of pins
 * waiting, so the houses' cars drive to the business and home again for as long as the menu is open.
 */

export const TITLE_COLS = 28;
export const TITLE_ROWS = 18;
/** Pins the business keeps waiting for a car, so the houses always have a trip to make. */
const WAITING_PINS = 2;
const NO_SPAWNS: MapRule[] = [{ kind: 'noSpawns' }];
const COLOR = 0;

const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];
const SIDE_STEP: Record<Side, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

let seed: number | null = null;

/** Sets the seed of the backdrop the next game runs, or null for a normal game. */
export function setBackdrop(next: number | null): void {
  seed = next;
}

/** The seed of the backdrop to run, or null when the game is a normal one. */
export function backdropSeed(): number | null {
  return seed;
}

/** The land family the backdrop draws in, from its seed, so each time the menu opens it can differ. Always shown dark. */
export function backdropPalette(seedValue: number): BasePaletteId {
  const i = (Math.floor(seedValue) >>> 0) % BASE_PALETTE_IDS.length;
  return BASE_PALETTE_IDS[i] ?? 'black';
}

/** The loop's tiles in driving order: four straight sides, with each corner cut by a diagonal. */
export function loopPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] {
  const out: [number, number][] = [];
  for (let x = x0 + 1; x <= x1 - 1; x++) out.push([x, y0]);
  for (let y = y0 + 1; y <= y1 - 1; y++) out.push([x1, y]);
  for (let x = x1 - 1; x >= x0 + 1; x--) out.push([x, y1]);
  for (let y = y1 - 1; y >= y0 + 1; y--) out.push([x0, y]);
  return out;
}

function shuffle<T>(rand: () => number, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = items[i];
    const b = items[j];
    if (a === undefined || b === undefined) continue;
    items[i] = b;
    items[j] = a;
  }
  return items;
}

/** Builds the backdrop's board. The same seed gives the same layout. */
export function buildTitleScene(seedValue: number): SimState {
  const cols = TITLE_COLS;
  const rows = TITLE_ROWS;
  const grid = createGrid(cols, rows, Terrain.Land);
  const sim = createSim({
    seed: seedValue,
    grid,
    roadBudget: 1000,
    rules: NO_SPAWNS,
  });
  const rand = (): number => nextFloat(sim.rng);
  const at = (x: number, y: number): number => y * cols + x;

  // The loop sits in the lower half, under the menu's title and buttons, with room below it for a lot.
  const width = 11 + Math.floor(rand() * 5);
  const height = 5 + Math.floor(rand() * 2);
  const x0 = Math.floor((cols - width) / 2) + Math.floor(rand() * 3) - 1;
  const x1 = x0 + width - 1;
  const y1 = rows - 4;
  const y0 = y1 - height;

  const path = loopPath(x0, y0, x1, y1).map(([x, y]) => at(x, y));
  placeRoads(sim, path);
  path.forEach((t, i) => {
    const next = path[(i + 1) % path.length];
    if (next !== undefined) linkTiles(sim, t, next);
  });
  const onLoop = new Set(path);
  // The empty corner tiles sit under the diagonal road, so nothing is built there.
  const corners = new Set([at(x0, y0), at(x1, y0), at(x0, y1), at(x1, y1)]);

  // The business: anywhere its lot's inlet joins the loop, inside it or out.
  const lotSpots: { origin: number; side: Side }[] = [];
  for (let origin = 0; origin < cols * rows; origin++) {
    for (const side of SIDES) lotSpots.push({ origin, side });
  }
  let business = -1;
  for (const { origin, side } of shuffle(rand, lotSpots)) {
    const lot = lotAt(sim.grid, origin, side, 'single');
    if (!lot || !onLoop.has(lot.road)) continue;
    if (lot.tiles.some((t) => corners.has(t))) continue;
    if (lotBlocker(sim, origin, side, 'single') !== null) continue;
    const placed = placeBuilding(sim, {
      kind: 'destination',
      color: COLOR,
      tile: origin,
      entrance: side,
      lot: 'single',
      shape: 'square',
    });
    if (placed.ok) {
      business = placed.id;
      break;
    }
  }
  if (business < 0) throw new Error('title scene: no room for the business');

  // Houses: each beside the loop, its entrance facing a loop tile, with a tile between neighbours.
  const lotTiles = reservedLotTiles(sim);
  const houseSpots: { tile: number; side: Side }[] = [];
  for (const road of path) {
    for (const side of SIDES) {
      const [dx, dy] = SIDE_STEP[side];
      const x = (road % cols) - dx;
      const y = Math.floor(road / cols) - dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      houseSpots.push({ tile: at(x, y), side });
    }
  }
  const wanted = 1 + Math.floor(rand() * 5);
  const houses: number[] = [];
  for (const { tile, side } of shuffle(rand, houseSpots)) {
    if (houses.length >= wanted) break;
    if (onLoop.has(tile) || corners.has(tile) || lotTiles.has(tile)) continue;
    if (sim.buildingAt[tile] !== -1) continue;
    const crowded = houses.some(
      (h) =>
        Math.max(
          Math.abs((h % cols) - (tile % cols)),
          Math.abs(Math.floor(h / cols) - Math.floor(tile / cols)),
        ) < 2,
    );
    if (crowded) continue;
    const placed = placeBuilding(sim, {
      kind: 'house',
      color: COLOR,
      tile,
      entrance: side,
    });
    if (placed.ok) houses.push(tile);
  }

  const demand = sim.demand[business];
  if (demand) demand.pins = WAITING_PINS;
  return sim;
}

/**
 * Keeps the backdrop running: takes each week's first offer, so the clock never waits, and keeps
 * the business at a couple of waiting pins, below the overflow limit, so trips go on and the run
 * never ends.
 */
export function keepTitleBusy(sim: SimState): void {
  for (
    let first = sim.offers[0]?.[0];
    first !== undefined;
    first = sim.offers[0]?.[0]
  ) {
    chooseOffer(sim, first);
  }
  for (const b of sim.buildings) {
    if (b.kind !== 'destination') continue;
    const demand = sim.demand[b.id];
    if (!demand) continue;
    demand.overflowFill = 0;
    const driving = demand.pins - unclaimedPins(sim, b.id);
    const waiting = Math.max(
      0,
      Math.min(WAITING_PINS, tuning.OVERFLOW_PIN_LIMIT - 1 - driving),
    );
    demand.pins = driving + waiting;
  }
}
