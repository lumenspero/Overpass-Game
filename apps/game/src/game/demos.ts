import {
  createGrid,
  createSim,
  linkTiles,
  placeBuilding,
  placeRoads,
  type Grid,
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

export type DemoId = 'bridge' | 'tunnel' | 'motorway' | 'roundabout' | 'light';

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
): number {
  const r = placeBuilding(sim, { kind, color, tile: at(x, y), entrance });
  if (!r.ok) throw new Error(`demo building refused: ${r.reason}`);
  return r.id;
}

/** Builds the demo's map, with its stock and its starting pins. */
export function buildDemo(id: DemoId): SimState {
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
  sim.stock[id] = 1;
  return sim;
}
