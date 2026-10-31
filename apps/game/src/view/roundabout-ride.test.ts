import {
  createSim,
  createGrid,
  linkTiles,
  moveCars,
  placeControl,
  placeRoads,
  type Car,
} from '@overpass-game/sim';
import { TILE_SIZE } from '@overpass-game/render-style';
import { describe, expect, it } from 'vitest';
import { carShapes } from './geometry.ts';

const COLS = 7;
const idx = (x: number, y: number) => y * COLS + x;

describe('a car crossing a roundabout', () => {
  it('drives round the ring rather than through the middle', () => {
    const sim = createSim({
      seed: 1,
      grid: createGrid(COLS, 7),
      roadBudget: 80,
    });
    const centre = idx(3, 3);
    const west = idx(2, 3);
    const south = idx(3, 4);
    const arms = [west, idx(4, 3), idx(3, 2), south];
    placeRoads(sim, [centre, ...arms]);
    for (const arm of arms) linkTiles(sim, centre, arm);
    sim.stock.roundabout = 1;
    expect(placeControl(sim, centre, 'roundabout')).toEqual({ ok: true });

    const car: Car = {
      id: 0,
      house: 0,
      destination: 0,
      state: 'driving',
      route: [west, centre, south],
      progress: 0,
      along: 0,
      timer: 0,
    };
    sim.cars.push(car);
    const middle = { x: 3.5 * TILE_SIZE, y: 3.5 * TILE_SIZE };
    const distances: number[] = [];
    let ticks = 0;
    while (car.progress < 2 && ticks < 2000) {
      moveCars(sim);
      ticks += 1;
      if (car.progress !== 1) continue;
      const [p] = carShapes(
        sim.cars,
        [],
        sim.grid,
        [0],
        sim.motorways,
        sim.controls,
      );
      distances.push(Math.hypot(p.x - middle.x, p.y - middle.y));
    }
    expect(distances.length).toBeGreaterThan(2);
    // The ring is a little over a third of a tile from the centre, so the car never gets near it.
    const closest = Math.min(...distances);
    const furthest = Math.max(...distances);
    expect(closest).toBeGreaterThan(0.25 * TILE_SIZE);
    expect(furthest).toBeLessThan(0.6 * TILE_SIZE);
  });
});
