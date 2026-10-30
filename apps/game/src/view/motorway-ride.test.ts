import {
  createGrid,
  createSim,
  linkTiles,
  moveCars,
  placeMotorway,
  placeRoads,
  tuning,
  type Car,
  type SimState,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '@overpass-game/render-style';
import { carShapes } from './geometry.ts';

const COLS = 14;
const idx = (x: number, y: number) => y * COLS + x;

/** Ground road from x 0 to x 13 on row 2, with a motorway between the ramps at x 2 and x 11. */
function town(): SimState {
  const sim = createSim({ seed: 1, grid: createGrid(COLS, 8), roadBudget: 80 });
  sim.stock.motorway = 1;
  const row = [];
  for (let x = 0; x < COLS; x++) row.push(idx(x, 2));
  placeRoads(sim, row);
  for (let x = 1; x < COLS; x++) linkTiles(sim, idx(x - 1, 2), idx(x, 2));
  const r = placeMotorway(sim, idx(2, 2), idx(11, 2), [
    { x: 2.5, y: 2.5 },
    { x: 6.5, y: 2.5 },
    { x: 11.5, y: 2.5 },
  ]);
  expect(r.ok).toBe(true);
  return sim;
}

describe('a car riding a motorway', () => {
  it('draws the road after a ramp at the same speed as the road', () => {
    const sim = town();
    const route = [
      idx(0, 2),
      idx(1, 2),
      idx(2, 2),
      idx(11, 2),
      idx(12, 2),
      idx(13, 2),
    ];
    const car: Car = {
      id: 0,
      house: 0,
      destination: 0,
      state: 'driving',
      route,
      progress: 0,
      along: 0,
      timer: 0,
    };
    sim.cars.push(car);
    // Ground speed in pixels per tick: the car covers CAR_SPEED / TICKS_PER_SECOND tiles.
    const groundPerTick =
      (tuning.CAR_SPEED / tuning.TICKS_PER_SECOND) * TILE_SIZE;
    let prev: { x: number; y: number } | null = null;
    const onRamp: number[] = [];
    let ticks = 0;
    while (car.progress < route.length - 1 && ticks < 5000) {
      const before = car.progress;
      moveCars(sim);
      ticks += 1;
      const [p] = carShapes(sim.cars, [], sim.grid, [0], sim.motorways);
      // Ticks spent wholly on the ramp tile (the road tile where the motorway ends).
      if (prev && before === 4 && car.progress === 4) {
        onRamp.push(Math.hypot(p.x - prev.x, p.y - prev.y));
      }
      prev = { x: p.x, y: p.y };
    }
    expect(onRamp.length).toBeGreaterThan(0);
    const avg = onRamp.reduce((a, b) => a + b, 0) / onRamp.length;
    expect(avg).toBeGreaterThan(groundPerTick * 0.85);
    expect(avg).toBeLessThan(groundPerTick * 1.15);
  });

  it('moves smoothly from the road, along the motorway, and back onto the road', () => {
    const sim = town();
    const route = [
      idx(0, 2),
      idx(1, 2),
      idx(2, 2),
      idx(11, 2),
      idx(12, 2),
      idx(13, 2),
    ];
    const car: Car = {
      id: 0,
      house: 0,
      destination: 0,
      state: 'driving',
      route,
      progress: 0,
      along: 0,
      timer: 0,
    };
    sim.cars.push(car);
    let prev: { x: number; y: number } | null = null;
    let maxJump = 0;
    let ticks = 0;
    while (car.progress < route.length - 1 && ticks < 5000) {
      moveCars(sim);
      ticks += 1;
      const [p] = carShapes(sim.cars, [], sim.grid, [0], sim.motorways);
      if (prev)
        maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.y - prev.y));
      prev = { x: p.x, y: p.y };
    }
    expect(car.progress).toBe(route.length - 1);
    expect(maxJump).toBeLessThan(10);
  });

  it('gets onto the ramp along the road, without cutting the corner', () => {
    const sim = createSim({
      seed: 1,
      grid: createGrid(COLS, 8),
      roadBudget: 80,
    });
    sim.stock.motorway = 1;
    const row = [];
    for (let x = 0; x < COLS; x++) row.push(idx(x, 2));
    placeRoads(sim, row);
    for (let x = 1; x < COLS; x++) linkTiles(sim, idx(x - 1, 2), idx(x, 2));
    // Handles well off the road, so a chord from the road onto the curve would visibly cut across.
    const r = placeMotorway(sim, idx(2, 2), idx(11, 2), [
      { x: 3.5, y: 4.5 },
      { x: 6.5, y: 4.5 },
      { x: 10.5, y: 4.5 },
    ]);
    expect(r.ok).toBe(true);
    const route = [idx(0, 2), idx(1, 2), idx(2, 2), idx(11, 2)];
    const car: Car = {
      id: 0,
      house: 0,
      destination: 0,
      state: 'driving',
      route,
      progress: 0,
      along: 0,
      timer: 0,
    };
    sim.cars.push(car);
    const onRamp: { x: number; y: number }[] = [];
    while (car.progress < 2 && onRamp.length < 500) {
      moveCars(sim);
    }
    // Drawn positions on the entry ramp tile (route index 2), for the first ticks there.
    while (car.progress === 2 && onRamp.length < 2) {
      moveCars(sim);
      const [p] = carShapes(sim.cars, [], sim.grid, [0], sim.motorways);
      onRamp.push({ x: p.x, y: p.y });
    }
    expect(onRamp.length).toBeGreaterThan(1);
    const first = onRamp[0];
    const last = onRamp[onRamp.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    // The first tick onto the ramp heads along the road (row 2 is level), not off the road's line.
    expect(Math.abs(dy)).toBeLessThan(Math.abs(dx) * 0.2);
  });
});
