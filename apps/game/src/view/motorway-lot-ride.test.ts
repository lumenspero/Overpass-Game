import {
  addDemandPin,
  createSim,
  createGrid,
  destinationLot,
  linkTiles,
  placeBuilding,
  placeMotorway,
  placeRoads,
  step,
} from '@overpass-game/sim';
import { TILE_SIZE } from '@overpass-game/render-style';
import { describe, expect, it } from 'vitest';
import { carShapes } from './geometry.ts';

const COLS = 30;
const idx = (x: number, y: number) => y * COLS + x;
const centre = (i: number) => ({
  x: (i % COLS) + 0.5,
  y: Math.floor(i / COLS) + 0.5,
});

describe('a car riding a motorway that ends at a lot', () => {
  it('is drawn moving at most a motorway step a tick, into the lot and back out', () => {
    const grid = createGrid(COLS, 24);
    const sim = createSim({ seed: 3, grid, roadBudget: 400 });
    sim.stock.motorway = 1;
    placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: idx(20, 5),
      entrance: 's',
    });
    const destination = sim.buildings.length - 1;
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: idx(3, 18),
      entrance: 'e',
    });
    const stub = sim.buildings[sim.buildings.length - 1]!.stub!;
    const row: number[] = [];
    for (let x = stub % COLS; x <= 8; x++)
      row.push(idx(x, Math.floor(stub / COLS)));
    placeRoads(sim, row);
    for (let i = 1; i < row.length; i++) linkTiles(sim, row[i - 1]!, row[i]!);
    const far = row[row.length - 1]!;
    const road = destinationLot(grid, sim.buildings[destination]!)!.road;
    expect(
      placeMotorway(sim, far, road, [
        centre(far),
        { x: 14.5, y: 16.5 },
        centre(road),
      ]).ok,
    ).toBe(true);

    const last = new Map<number, { x: number; y: number }>();
    let worst = 0;
    let rides = 0;
    for (let t = 0; t < 4000; t++) {
      if (t % 90 === 0) addDemandPin(sim, destination);
      step(sim);
      const shapes = carShapes(
        sim.cars,
        sim.buildings,
        sim.grid,
        [0],
        sim.motorways,
        sim.controls,
        sim.links,
      );
      sim.cars.forEach((car, i) => {
        const s = shapes[i];
        if (!s) return;
        const p = { x: s.x / TILE_SIZE, y: s.y / TILE_SIZE };
        const q = last.get(car.id);
        if (q) worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y));
        last.set(car.id, p);
        if (car.lot?.phase === 'parked') rides += 1;
      });
    }
    expect(rides).toBeGreaterThan(0);
    // Motorway speed is about 0.17 tiles a tick; a jump back to the far ramp was 18 tiles.
    expect(worst).toBeLessThan(0.2);
  });
});
