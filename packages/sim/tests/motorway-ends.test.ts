import { describe, expect, it } from 'vitest';
import {
  addDemandPin,
  createSim,
  destinationLot,
  linkTiles,
  motorwayCurve,
  placeBuilding,
  placeControl,
  placeMotorway,
  placeRoads,
  roundaboutPath,
  step,
  unlinkTiles,
  type SimState,
} from '../src/index.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

const COLS = 30;
const centre = (i: number) => ({
  x: (i % COLS) + 0.5,
  y: Math.floor(i / COLS) + 0.5,
});

/** A house whose road runs to a motorway that ends on a business's lot access tile. */
function lotAtMotorwayEnd(): { sim: SimState; destination: number } {
  const grid = makeGrid(COLS, 24);
  const sim = createSim({ seed: 3, grid, roadBudget: 400 });
  sim.stock.motorway = 1;
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(grid, 20, 5),
    entrance: 's',
  });
  const destination = sim.buildings.length - 1;
  placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(grid, 3, 18),
    entrance: 'e',
  });
  const stub = sim.buildings[sim.buildings.length - 1]!.stub!;
  const row: number[] = [];
  for (let x = stub % COLS; x <= 8; x++)
    row.push(at(grid, x, Math.floor(stub / COLS)));
  drawRoads(sim, row);
  const far = row[row.length - 1]!;
  const road = destinationLot(grid, sim.buildings[destination]!)!.road;
  expect(
    placeMotorway(sim, far, road, [
      centre(far),
      { x: 14.5, y: 16.5 },
      centre(road),
    ]).ok,
  ).toBe(true);
  return { sim, destination };
}

describe('a motorway that ends on a lot access tile', () => {
  it('takes every car into the lot, and never serves one waiting on the road', () => {
    const { sim, destination } = lotAtMotorwayEnd();
    const parked = new Set<number>();
    const seen = new Set<number>();
    for (let t = 0; t < 4000; t++) {
      if (t % 90 === 0) addDemandPin(sim, destination);
      step(sim);
      for (const car of sim.cars) {
        seen.add(car.id);
        expect(car.state === 'parked' && car.lot === undefined).toBe(false);
        if (car.lot?.phase === 'parked') parked.add(car.id);
      }
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(parked.size).toBe(seen.size);
  });

  it('rides out of the lot at motorway speed, not across the whole motorway in a few ticks', () => {
    const { sim, destination } = lotAtMotorwayEnd();
    const length = sim.motorways[0]!.length;
    let worst = 0;
    const last = new Map<number, number>();
    for (let t = 0; t < 4000; t++) {
      if (t % 90 === 0) addDemandPin(sim, destination);
      step(sim);
      for (const car of sim.cars) {
        const onRide =
          car.lot === undefined &&
          car.state === 'returning' &&
          car.progress === 0;
        if (!onRide) {
          last.delete(car.id);
          continue;
        }
        const before = last.get(car.id);
        if (before !== undefined)
          worst = Math.max(worst, (car.along - before) * length);
        last.set(car.id, car.along);
      }
    }
    // Motorway speed is 2.5 ground tiles a second, so about 0.17 tiles a tick.
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.2);
  });
});

describe('a motorway ramp', () => {
  it('follows the road at its ramp when the road there is redrawn', () => {
    const grid = makeGrid(COLS, 20);
    const sim = createSim({ seed: 1, grid, roadBudget: 300 });
    sim.stock.motorway = 1;
    const west = [
      at(grid, 5, 10),
      at(grid, 6, 10),
      at(grid, 7, 10),
      at(grid, 8, 10),
    ];
    placeRoads(sim, [
      ...west,
      at(grid, 20, 10),
      at(grid, 21, 10),
      at(grid, 7, 9),
      at(grid, 6, 8),
    ]);
    for (let i = 1; i < west.length; i++)
      linkTiles(sim, west[i - 1]!, west[i]!);
    linkTiles(sim, at(grid, 20, 10), at(grid, 21, 10));
    placeMotorway(sim, at(grid, 8, 10), at(grid, 20, 10), [
      centre(at(grid, 8, 10)),
      { x: 14.5, y: 12 },
      centre(at(grid, 20, 10)),
    ]);
    const m = sim.motorways[0]!;
    expect(m.aDir).toEqual({ x: 1, y: 0 });
    // The road now comes in from the north-west instead.
    unlinkTiles(sim, at(grid, 7, 10), at(grid, 8, 10));
    linkTiles(sim, at(grid, 7, 9), at(grid, 8, 10));
    expect(m.aDir?.x).toBeCloseTo(Math.SQRT1_2);
    expect(m.aDir?.y).toBeCloseTo(Math.SQRT1_2);
    // The curve starts on the tile edge the new road comes in by.
    const start = motorwayCurve(grid, m)[0]!;
    expect(start.x).toBeLessThan(8.5);
    expect(start.y).toBeLessThan(10.5);
  });
});

describe('a roundabout with a diagonal arm', () => {
  it('meets that arm at its neighbour’s centre, as it does a straight arm', () => {
    const grid = makeGrid(20, 20);
    const sim = createSim({ seed: 1, grid, roadBudget: 100 });
    sim.stock.roundabout = 1;
    const ring = at(grid, 10, 10);
    const tiles = [at(grid, 9, 9), ring, at(grid, 11, 10)];
    placeRoads(sim, tiles);
    linkTiles(sim, tiles[0]!, ring);
    linkTiles(sim, ring, tiles[2]!);
    expect(placeControl(sim, ring, 'roundabout').ok).toBe(true);
    const path = roundaboutPath(grid, tiles[0]!, ring, tiles[2]!);
    const first = path[0]!;
    const final = path[path.length - 1]!;
    expect(Math.hypot(first.x - 10.5, first.y - 10.5)).toBeCloseTo(
      Math.SQRT2,
      5,
    );
    expect(Math.hypot(final.x - 10.5, final.y - 10.5)).toBeCloseTo(1, 5);
  });
});
