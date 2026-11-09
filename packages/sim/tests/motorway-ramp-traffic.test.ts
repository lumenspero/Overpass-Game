import { afterEach, describe, expect, it } from 'vitest';
import {
  createSim,
  destinationLot,
  placeBuilding,
  placeMotorway,
  resetTuning,
  step,
  tuning,
  type Car,
  type SimState,
} from '../src/index.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

const COLS = 40;
const centre = (i: number) => ({
  x: (i % COLS) + 0.5,
  y: Math.floor(i / COLS) + 0.5,
});

afterEach(() => resetTuning());

/**
 * A street along row 5 with houses at its west end. Colour 0's business is reached only by a long
 * motorway whose ramp is on the street at (12, 5); colour 1's business is further east along the
 * street, so its cars drive through the ramp tile on the ground. With `branch`, a side road leaves
 * the ramp tile, which makes it a junction.
 */
function world(branch: boolean): { sim: SimState; ramp: number } {
  const grid = makeGrid(COLS, 34);
  const sim = createSim({
    seed: 2,
    grid,
    roadBudget: 900,
    rules: [{ kind: 'pace', arrivalsPerWeek: 0, demandPace: 4 }],
  });
  tuning.OVERFLOW_PIN_LIMIT = 1e9;
  tuning.OVERFLOW_FILL_PINS = 1e9;
  sim.stock.motorway = 1;
  for (let x = 2; x <= 7; x++) {
    const placed = placeBuilding(sim, {
      kind: 'house',
      color: x % 2,
      tile: at(grid, x, 4),
      entrance: 's',
    });
    if (!placed.ok) throw new Error('house refused');
  }
  const street: number[] = [];
  for (let x = 2; x <= 24; x++) street.push(at(grid, x, 5));
  drawRoads(sim, street);
  const ramp = at(grid, 12, 5);
  if (branch) drawRoads(sim, [ramp, at(grid, 12, 4), at(grid, 12, 3)]);
  // Colour 1's business, on the street's east end.
  const east = placeBuilding(sim, {
    kind: 'destination',
    color: 1,
    tile: at(grid, 24, 6),
    entrance: 'n',
  });
  // Colour 0's business, far to the south, with a short road to the motorway's other ramp.
  const south = placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(grid, 14, 28),
    entrance: 'n',
  });
  if (!east.ok || !south.ok) throw new Error('business refused');
  const lot = destinationLot(grid, sim.buildings[south.id]!);
  if (!lot) throw new Error('no lot');
  const far = lot.road - 2;
  drawRoads(sim, [far, lot.road - 1, lot.road]);
  const placed = placeMotorway(sim, ramp, far, [
    centre(ramp),
    { x: 10.5, y: 16.5 },
    centre(far),
  ]);
  if (!placed.ok) throw new Error(`motorway refused: ${placed.reason}`);
  return { sim, ramp };
}

/**
 * Runs the sim and returns the longest any one car stood still on the road, in ticks, and how many
 * trips reached colour 1's business (the one reached on the ground, through the ramp tile).
 */
function run(
  sim: SimState,
  ramp: number,
  ticks: number,
): { longestWait: number; rides: number } {
  const still = new Map<number, { key: string; since: number }>();
  let longestWait = 0;
  let rides = 0;
  const riding = (c: Car) =>
    c.route[c.progress] === ramp &&
    sim.motorways.some(
      (m) => c.route[c.progress + 1] === (m.a === ramp ? m.b : m.a),
    );
  for (let i = 0; i < ticks; i++) {
    step(sim);
    for (const c of sim.cars) {
      if (c.lot !== undefined || c.state === 'parked') {
        still.delete(c.id);
        continue;
      }
      if (riding(c)) rides += 1;
      const key = `${c.route[c.progress]}:${c.along.toFixed(5)}`;
      const was = still.get(c.id);
      if (!was || was.key !== key) still.set(c.id, { key, since: sim.tick });
      else longestWait = Math.max(longestWait, sim.tick - was.since);
    }
  }
  return { longestWait, rides };
}

describe('traffic at a motorway ramp tile', () => {
  // A car up on the curve is on its ramp tile for the whole ride, as far as its route goes. It must
  // not hold that tile's road: before this was fixed, a junction on the ramp stayed shut for the ride
  // (cars stood for over 700 ticks here), and a car stopped on the ramp tile held riders in mid-air.
  const FIVE_SECONDS = 5 * tuning.TICKS_PER_SECOND;

  it('lets ground cars through the ramp tile while cars ride the motorway', () => {
    const { sim, ramp } = world(false);
    const result = run(sim, ramp, 6000);
    expect(result.rides).toBeGreaterThan(0);
    expect(result.longestWait).toBeLessThan(FIVE_SECONDS);
  });

  it('does not hold a junction on the ramp tile for the length of a ride', () => {
    const { sim, ramp } = world(true);
    const result = run(sim, ramp, 6000);
    expect(result.rides).toBeGreaterThan(0);
    expect(result.longestWait).toBeLessThan(FIVE_SECONDS);
  });
});

describe('a car that turns as it leaves a motorway', () => {
  it('drives across the ramp tile to the edge it leaves by, instead of jumping there', () => {
    const grid = makeGrid(COLS, 34);
    const sim = createSim({
      seed: 2,
      grid,
      roadBudget: 900,
      rules: [{ kind: 'pace', arrivalsPerWeek: 0, demandPace: 4 }],
    });
    tuning.OVERFLOW_PIN_LIMIT = 1e9;
    tuning.OVERFLOW_FILL_PINS = 1e9;
    sim.stock.motorway = 1;
    for (let y = 6; y <= 9; y++) {
      placeBuilding(sim, {
        kind: 'house',
        color: 0,
        tile: at(grid, 11, y),
        entrance: 'e',
      });
    }
    const street: number[] = [];
    for (let y = 12; y >= 4; y--) street.push(at(grid, 12, y));
    drawRoads(sim, street);
    // The ramp is the east end of a cross street, so a car off the motorway turns back along it.
    const cross: number[] = [];
    for (let x = 8; x <= 16; x++) cross.push(at(grid, x, 12));
    drawRoads(sim, cross);
    const ramp = at(grid, 16, 12);
    const south = placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(grid, 14, 28),
      entrance: 'n',
    });
    if (!south.ok) throw new Error('business refused');
    const lot = destinationLot(grid, sim.buildings[south.id]!);
    if (!lot) throw new Error('no lot');
    const far = lot.road - 2 - 2 * COLS;
    drawRoads(sim, [far, far + COLS, far + 2 * COLS, lot.road - 1, lot.road]);
    const placed = placeMotorway(sim, ramp, far, [
      centre(ramp),
      { x: 22.5, y: 18.5 },
      centre(far),
    ]);
    if (!placed.ok) throw new Error(`motorway refused: ${placed.reason}`);

    const last = new Map<number, number>();
    let turns = 0;
    let biggestJump = 0;
    for (let i = 0; i < 2500; i++) {
      step(sim);
      for (const car of sim.cars) {
        const onRamp =
          car.lot === undefined &&
          car.progress > 0 &&
          car.route[car.progress] === ramp &&
          car.route[car.progress - 1] === far;
        if (!onRamp) {
          last.delete(car.id);
          continue;
        }
        if (!last.has(car.id)) turns += 1;
        biggestJump = Math.max(
          biggestJump,
          car.along - (last.get(car.id) ?? 0),
        );
        last.set(car.id, car.along);
      }
    }
    expect(turns).toBeGreaterThan(0);
    // A tile's worth of road at CAR_SPEED: no more than a small part of the tile each tick.
    expect(biggestJump).toBeLessThan(0.2);
  });
});
