import {
  addCar,
  chooseOffer,
  joinAlong,
  createGrid,
  createSim,
  nextFloat,
  linkTiles,
  placeBuilding,
  placeRoads,
  laneOfRoute,
  roadLinks,
  type Grid,
  type LotKind,
  type Side,
  type SimState,
  Terrain,
  type TerrainKind,
} from '@overpass-game/sim';

/**
 * Scripted demos (spec: Upgrades, Demos; a playtesting aid). Each is a small map where one
 * upgrade is the only way to connect a house to its destination, so it can be tried in
 * isolation. Pick one from the debug panel; "Test map" returns to the normal map.
 */

export type DemoId =
  | 'bridge'
  | 'tunnel'
  | 'motorway'
  | 'roundabout'
  | 'light'
  | 'lots'
  | 'buildings'
  | 'cars';

export interface Demo {
  id: DemoId;
  title: string;
  hint: string;
}

export const DEMOS: readonly Demo[] = [
  {
    id: 'bridge',
    title: 'Bridge',
    hint: 'Demo · Bridge (B): drag across the river to join the two roads.',
  },
  {
    id: 'tunnel',
    title: 'Tunnel',
    hint: 'Demo · Tunnel (T): drag through the mountain to join the two roads.',
  },
  {
    id: 'motorway',
    title: 'Motorway',
    hint: 'Demo · Motorway (M): drag from the west road to the east road, over the mountain.',
  },
  {
    id: 'roundabout',
    title: 'Roundabout',
    hint: 'Demo · Roundabout (O): press O, then click the crossing.',
  },
  {
    id: 'light',
    title: 'Traffic light',
    hint: 'Demo · Traffic light (L): press L, then click the crossing.',
  },
  {
    id: 'lots',
    title: 'Lots: single vs double',
    hint: 'Demo · Lots: the left destination is square with a single lot, the right round with a double lot. Its second building arrives a set number of weeks after it is placed (debug panel). The far inlet of the double lot is reached by the loop round the east end of the road.',
  },
  {
    id: 'buildings',
    title: 'Buildings: square and round',
    hint: 'Demo · Buildings: a square destination (left), a round one (middle) and a round double lot (right). Square pins more slowly. The second building of the double lot arrives after its delay (debug panel).',
  },
  {
    id: 'cars',
    title: '300 cars',
    hint: 'Demo · 300 cars: five streets, with 300 cars already driving and no new ones spawning. Frame and sim times are in the debug line.',
  },
];

let active: DemoId | null = null;

/** The demo the next run starts with, or null for the normal test map. */
export function activeDemo(): DemoId | null {
  return active;
}

export function setActiveDemo(id: DemoId | null): void {
  active = id;
}

const COLS = 16;
const ROWS = 14;
const at = (x: number, y: number): number => y * COLS + x;

/** The tiles of a straight horizontal or vertical line, from one end to the other. */
function line(from: [number, number], to: [number, number]): number[] {
  const out: number[] = [];
  const dx = Math.sign(to[0] - from[0]);
  const dy = Math.sign(to[1] - from[1]);
  let x = from[0];
  let y = from[1];
  for (;;) {
    out.push(at(x, y));
    if (x === to[0] && y === to[1]) break;
    x += dx;
    y += dy;
  }
  return out;
}

function fill(
  grid: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind: TerrainKind,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) grid.terrain[at(x, y)] = kind;
  }
}

/** Lays a straight run of road and links each tile to the next. */
function road(sim: SimState, tiles: number[]): void {
  placeRoads(sim, tiles);
  for (let k = 1; k < tiles.length; k++) {
    linkTiles(sim, tiles[k - 1], tiles[k]);
  }
}

function building(
  sim: SimState,
  kind: 'house' | 'destination',
  color: number,
  x: number,
  y: number,
  entrance: Side,
  lot?: LotKind,
  shape?: 'square' | 'round',
): number {
  const r = placeBuilding(sim, {
    kind,
    color,
    tile: at(x, y),
    entrance,
    lot,
    shape,
  });
  if (!r.ok) throw new Error(`demo building refused: ${r.reason}`);
  return r.id;
}

/** Cars the 300-car demo starts with, and the streets it lays. */
const CAR_DEMO_COUNT = 300;
const CAR_DEMO_COLS = 48;
const CAR_DEMO_ROWS = 32;
const CAR_DEMO_STREETS = [3, 9, 15, 21, 27];

/**
 * A performance demo (spec: Performance). Houses sit on the row above each street and
 * destinations on the row below, so every trip runs along the street. Spawning from the houses
 * is off, so the car count stays at the demo's 300.
 */
function buildCarDemo(): SimState {
  const grid = createGrid(CAR_DEMO_COLS, CAR_DEMO_ROWS, Terrain.Land);
  const sim = createSim({ seed: 7, grid, roadBudget: 100000 });
  const tile = (x: number, y: number): number => y * CAR_DEMO_COLS + x;
  const place = (
    kind: 'house' | 'destination',
    x: number,
    y: number,
    entrance: Side,
    lot?: LotKind,
    shape?: 'square' | 'round',
  ): void => {
    const r = placeBuilding(sim, {
      kind,
      color: 0,
      tile: tile(x, y),
      entrance,
      lot,
      shape,
    });
    if (!r.ok) throw new Error(`car demo building refused: ${r.reason}`);
  };
  for (const y of CAR_DEMO_STREETS) {
    const row: number[] = [];
    for (let x = 0; x < CAR_DEMO_COLS; x++) row.push(tile(x, y));
    road(sim, row);
    for (let x = 0; x + 6 < CAR_DEMO_COLS; x += 5) {
      place('destination', x, y + 1, 'n', 'single', 'square');
      place('house', x + 1, y - 1, 's');
    }
  }
  const houses = sim.buildings.filter((b) => b.kind === 'house');
  const destinations = sim.buildings.filter((b) => b.kind === 'destination');
  let added = 0;
  for (let attempt = 0; attempt < 50000 && added < CAR_DEMO_COUNT; attempt++) {
    const h = houses[Math.floor(nextFloat(sim.rng) * houses.length)];
    const d =
      destinations[Math.floor(nextFloat(sim.rng) * destinations.length)];
    if (addDemoCarOnRoute(sim, h.id, d.id)) added += 1;
  }
  for (const h of houses) {
    const home = sim.homes[h.id];
    if (home) home.atHome = 0;
  }
  return sim;
}

/**
 * Adds cars back to the 300-car demo as trips finish, so its load holds at 300. A few attempts
 * per call keep a frame from spiking; a missed pair is simply tried again on the next frame.
 */
export function keepCarDemoFull(sim: SimState): void {
  // The clock waits on an open offer. The stress demo has no one to pick one, so it takes the first option.
  while (
    sim.offers.length > 0 &&
    sim.offers[0] &&
    sim.offers[0][0] !== undefined
  ) {
    chooseOffer(sim, sim.offers[0][0]);
  }
  if (sim.cars.length >= CAR_DEMO_COUNT) return;
  const houses = sim.buildings.filter((b) => b.kind === 'house');
  const destinations = sim.buildings.filter((b) => b.kind === 'destination');
  if (houses.length === 0 || destinations.length === 0) return;
  for (
    let attempt = 0;
    attempt < 20 && sim.cars.length < CAR_DEMO_COUNT;
    attempt++
  ) {
    const h = houses[Math.floor(nextFloat(sim.rng) * houses.length)];
    const d =
      destinations[Math.floor(nextFloat(sim.rng) * destinations.length)];
    addDemoCar(sim, h.id, d.id);
  }
}

/**
 * Adds a starting demo car part way along its trip, on a tile with no other car in its lane, so the demo
 * starts full without cars stacked at the house entrances. It sits mid-tile on a plain road tile, never on a
 * junction or near either end of its route.
 */
function addDemoCarOnRoute(
  sim: SimState,
  house: number,
  destination: number,
): boolean {
  if (!addCar(sim, house, destination).ok) return false;
  const car = sim.cars[sim.cars.length - 1];
  if (!car) return false;
  const n = car.route.length;
  const k = n >= 4 ? 1 + Math.floor(nextFloat(sim.rng) * (n - 3)) : -1;
  // One car per lane per tile, each at the tile's middle, keeps a whole tile between cars in a lane.
  const lane = k > 0 ? laneOfRoute(sim.grid, car.route, k) : -1;
  const clear =
    k > 0 &&
    roadLinks(sim.roads, sim.links, car.route[k] as number).length < 3 &&
    !sim.cars.some(
      (o) =>
        o !== car &&
        o.lot === undefined &&
        o.route[o.progress] === car.route[k] &&
        laneOfRoute(sim.grid, o.route, o.progress) === lane,
    );
  if (!clear) {
    sim.cars.pop();
    return false;
  }
  car.progress = k;
  car.along = 0.5;
  return true;
}

/** Adds a demo car at its house, joining the road only where it is clear, as a car from a house does. */
function addDemoCar(
  sim: SimState,
  house: number,
  destination: number,
): boolean {
  if (!addCar(sim, house, destination).ok) return false;
  const car = sim.cars[sim.cars.length - 1];
  if (!car) return false;
  const along = joinAlong(sim, car.route[0] as number, car, null);
  if (along === null) {
    sim.cars.pop();
    return false;
  }
  car.along = along;
  return true;
}

/** Builds the demo's map, with its stock and its starting pins. */
export function buildDemo(id: DemoId): SimState {
  if (id === 'cars') return buildCarDemo();
  const grid = createGrid(COLS, ROWS, Terrain.Land);
  const sim = createSim({ seed: 1, grid });
  // A destination is 3×3 with a 5×3 lot. The coordinates given are the lot's origin (its top-left
  // tile), and the lot's inlet joins the road on the side the destination faces.
  if (id === 'bridge') {
    fill(grid, 7, 0, 7, ROWS - 1, Terrain.Water);
    road(sim, line([4, 5], [6, 5]));
    road(sim, line([8, 5], [11, 5]));
    building(sim, 'house', 0, 3, 5, 'e');
    building(sim, 'destination', 0, 12, 1, 'w');
  } else if (id === 'tunnel') {
    fill(grid, 7, 0, 8, ROWS - 1, Terrain.Mountain);
    road(sim, line([4, 5], [6, 5]));
    road(sim, line([9, 5], [11, 5]));
    building(sim, 'house', 0, 3, 5, 'e');
    building(sim, 'destination', 0, 12, 1, 'w');
  } else if (id === 'motorway') {
    fill(grid, 6, 0, 9, ROWS - 1, Terrain.Mountain);
    road(sim, line([4, 5], [5, 5]));
    road(sim, line([10, 5], [12, 5]));
    building(sim, 'house', 0, 3, 5, 'e');
    building(sim, 'destination', 0, 13, 1, 'w');
  } else if (id === 'roundabout' || id === 'light') {
    // A crossing at (7, 6), with a house and a destination on each road of the cross.
    road(sim, line([4, 6], [10, 6]));
    road(sim, line([7, 3], [7, 9]));
    building(sim, 'house', 0, 3, 6, 'e');
    building(sim, 'destination', 0, 11, 2, 'w');
    building(sim, 'house', 1, 7, 2, 's');
    building(sim, 'destination', 1, 7, 10, 'n');
  }
  if (id === 'lots') {
    // One road, with a single-lot and a double-lot destination, each with a house of its colour.
    road(sim, line([2, 5], [15, 5]));
    // A loop round the double lot's far side, so its far inlet is on the road network.
    road(sim, line([15, 5], [15, 12]));
    road(sim, line([15, 12], [10, 12]));
    building(sim, 'house', 0, 2, 4, 's');
    building(sim, 'destination', 0, 4, 6, 'n', 'single', 'square');
    building(sim, 'house', 1, 9, 4, 's');
    building(sim, 'destination', 1, 10, 6, 'n', 'double', 'round');
  }
  if (id === 'buildings') {
    // One road, with a square and a round single-lot destination and a round double lot, each with a house.
    road(sim, line([0, 5], [15, 5]));
    building(sim, 'house', 0, 1, 4, 's');
    building(sim, 'destination', 0, 0, 6, 'n', 'single', 'square');
    building(sim, 'house', 1, 6, 4, 's');
    building(sim, 'destination', 1, 5, 6, 'n', 'single', 'round');
    building(sim, 'house', 1, 11, 4, 's');
    building(sim, 'destination', 1, 10, 6, 'n', 'double', 'round');
  }
  if (id !== 'lots' && id !== 'buildings') sim.stock[id] = 1;
  return sim;
}
