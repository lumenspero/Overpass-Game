import { describe, expect, it } from 'vitest';
import {
  addCar,
  createSim,
  destinationLot,
  lotPath,
  roundedPath,
  placeBuilding,
  startLotTrip,
  step,
  type SimState,
} from '../src/index.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

/** House at (0,2) facing east, destination at (3,3) facing north, road between them on row 2. */
function world(): SimState {
  const sim = createSim({ seed: 1, grid: makeGrid(8, 8), roadBudget: 100 });
  placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(sim.grid, 0, 2),
    entrance: 'e',
  });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(sim.grid, 3, 3),
    entrance: 'n',
  });
  sim.demand[1].pins = 2;
  drawRoads(sim, [at(sim.grid, 1, 2), at(sim.grid, 2, 2), at(sim.grid, 3, 2)]);
  return sim;
}

describe('lot paths', () => {
  it('start at the road node and end in a strip space', () => {
    const sim = world();
    const building = sim.buildings[1];
    const lot = destinationLot(sim.grid, building);
    if (!lot) throw new Error('no lot');
    const stripTiles = new Set(lot.strip);
    for (const k of [0, 1, 2]) {
      for (const phase of ['in', 'out'] as const) {
        const path = lotPath(sim.grid, building, k, phase);
        if (!path) throw new Error('no path');
        // The node is the road tile in front of the inlet: its centre is (3.5, 2.5).
        const node = phase === 'in' ? path[0] : path[path.length - 1];
        expect(node).toEqual({ x: 3.5, y: 2.5 });
      }
      const inPath = lotPath(sim.grid, building, k, 'in');
      if (!inPath) throw new Error('no path');
      const end = inPath[inPath.length - 1];
      const tile = Math.floor(end.y) * sim.grid.cols + Math.floor(end.x);
      expect(stripTiles.has(tile)).toBe(true);
    }
  });
});

describe('lot trips', () => {
  it('drives a car in to a space, parks it, and drives it out to the road', () => {
    const sim = world();
    step(sim);
    const car = sim.cars[0];
    let parked = false;
    let left = false;
    let inLot = false;
    for (let i = 0; i < 2000 && sim.cars.includes(car); i++) {
      step(sim);
      if (car.lot) inLot = true;
      if (car.lot?.phase === 'parked') parked = true;
      if (inLot && car.lot === undefined && car.state === 'returning') {
        left = true;
        break;
      }
    }
    expect(parked).toBe(true);
    expect(left).toBe(true);
  });

  it('lets one car at a time drive into the lot', () => {
    const sim = world();
    const first = addCar(sim, 0, 1);
    const second = addCar(sim, 0, 1);
    if (!first.ok || !second.ok) throw new Error('setup failed');
    const [a, b] = sim.cars;
    const end = a.route.length - 1;
    for (const car of [a, b]) {
      car.progress = end;
      car.along = 1;
    }
    expect(startLotTrip(sim, a)).toBe('started');
    expect(startLotTrip(sim, b)).toBe('waiting');
  });

  it('holds a car on the road while every space is taken', () => {
    const sim = world();
    const cars = [0, 1, 2, 3].map(() => addCar(sim, 0, 1));
    if (cars.some((r) => !r.ok)) throw new Error('setup failed');
    const [a, b, c, d] = sim.cars;
    for (const [k, car] of [a, b, c].entries()) {
      car.lot = {
        destination: 1,
        space: k,
        inlet: 'near',
        phase: 'parked',
        path: [],
        s: 0,
        length: 0,
      };
    }
    d.progress = d.route.length - 1;
    d.along = 1;
    expect(startLotTrip(sim, d)).toBe('waiting');
    expect(d.lot).toBeUndefined();
  });
});

describe('lane shape', () => {
  it('turns through curves, and parks along the space slant', () => {
    const sim = world();
    const building = sim.buildings[1];
    for (const k of [0, 1, 2]) {
      for (const phase of ['in', 'out'] as const) {
        const path = roundedPath(lotPath(sim.grid, building, k, phase) ?? []);
        // No heading change between neighbouring points is sharper than about 20 degrees.
        for (let i = 2; i < path.length; i++) {
          const h1 = Math.atan2(
            path[i - 1].y - path[i - 2].y,
            path[i - 1].x - path[i - 2].x,
          );
          const h2 = Math.atan2(
            path[i].y - path[i - 1].y,
            path[i].x - path[i - 1].x,
          );
          let turn = Math.abs(h2 - h1);
          if (turn > Math.PI) turn = 2 * Math.PI - turn;
          expect(turn).toBeLessThan((20 * Math.PI) / 180);
        }
      }
      // The drive in ends along the space slope (1, 0.25).
      const inPath = roundedPath(lotPath(sim.grid, building, k, 'in') ?? []);
      const a = inPath[inPath.length - 2];
      const b = inPath[inPath.length - 1];
      expect((b.y - a.y) / (b.x - a.x)).toBeCloseTo(0.25, 6);
    }
  });
});
