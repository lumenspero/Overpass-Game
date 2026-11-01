import { TILE_SIZE } from '@overpass-game/render-style';
import {
  accessTile,
  createGrid,
  createSim,
  linkTiles,
  placeBuilding,
  placeRoads,
  step,
  type Side,
  type SimState,
  Terrain,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { carShapes } from './geometry.ts';

/** A house and destination joined by a road drawn in order. Each layout is one trip. */
interface Layout {
  name: string;
  house: [number, number, Side];
  destination: [number, number, Side];
  road: Array<[number, number]>;
}

const LAYOUTS: Layout[] = [
  {
    name: 'straight, house west of destination',
    house: [1, 2, 'e'],
    destination: [5, 3, 'n'],
    road: [
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
    ],
  },
  {
    name: 'bend, as in the screenshot',
    house: [1, 1, 'e'],
    destination: [6, 5, 'n'],
    road: [
      [2, 1],
      [3, 1],
      [4, 1],
      [4, 2],
      [4, 3],
      [4, 4],
      [5, 4],
      [6, 4],
    ],
  },
  {
    name: 'destination on a vertical road',
    house: [4, 1, 's'],
    destination: [6, 6, 'n'],
    road: [
      [4, 2],
      [4, 3],
      [4, 4],
      [5, 4],
      [6, 4],
      [6, 5],
    ],
  },
];

function build(layout: Layout): SimState {
  const grid = createGrid(12, 10, Terrain.Land);
  const sim = createSim({ seed: 3, grid, roadBudget: 200 });
  const at = (x: number, y: number) => y * grid.cols + x;
  placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(layout.house[0], layout.house[1]),
    entrance: layout.house[2],
  });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(layout.destination[0], layout.destination[1]),
    entrance: layout.destination[2],
  });
  const path = layout.road.map(([x, y]) => at(x, y));
  placeRoads(sim, path);
  for (let i = 1; i < path.length; i++) linkTiles(sim, path[i - 1], path[i]);
  sim.demand[1].pins = 1;
  return sim;
}

/** Tile index a world point falls in, or -1 outside the grid. */
function tileAt(sim: SimState, x: number, y: number): number {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= sim.grid.cols || ty >= sim.grid.rows) return -1;
  return ty * sim.grid.cols + tx;
}

describe.each(LAYOUTS)('car dots, $name', (layout) => {
  it('stay on a road or in their building, and never jump', () => {
    const sim = build(layout);
    const problems: string[] = [];
    let prev = new Map<number, { x: number; y: number }>();
    let trips = 0;
    for (let t = 0; t < 1500; t++) {
      step(sim);
      trips = Math.max(trips, sim.tripsCompleted);
      const shapes = carShapes(sim.cars, sim.buildings, sim.grid, [0]);
      const next = new Map<number, { x: number; y: number }>();
      sim.cars.forEach((car, i) => {
        const p = shapes[i];
        next.set(car.id, { x: p.x, y: p.y });
        const tile = tileAt(sim, p.x, p.y);
        const onRoad = tile >= 0 && sim.roads[tile] === 1;
        const inBuilding = tile >= 0 && sim.buildingAt[tile] !== -1;
        if (!onRoad && !inBuilding && problems.length < 6) {
          problems.push(
            `tick ${sim.tick}: car ${car.id} ${car.state} off road at (${(p.x / TILE_SIZE).toFixed(2)}, ${(p.y / TILE_SIZE).toFixed(2)})`,
          );
        }
        const last = prev.get(car.id);
        if (last) {
          const jump = Math.hypot(p.x - last.x, p.y - last.y) / TILE_SIZE;
          if (jump > 0.2 && problems.length < 6) {
            problems.push(
              `tick ${sim.tick}: car ${car.id} ${car.state} jumped ${jump.toFixed(2)} tiles`,
            );
          }
        }
      });
      prev = next;
    }
    expect(trips).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  it('a parked car sits on the road tile in front of its destination lot', () => {
    const sim = build(layout);
    for (let t = 0; t < 1500; t++) {
      step(sim);
      const car = sim.cars.find((c) => c.state === 'parked');
      if (car) {
        const idx = sim.cars.indexOf(car);
        const p = carShapes(sim.cars, sim.buildings, sim.grid, [0])[idx];
        const b = sim.buildings[car.destination];
        expect(tileAt(sim, p.x, p.y)).toBe(accessTile(sim.grid, b));
        return;
      }
    }
    throw new Error('no car parked');
  });
});
