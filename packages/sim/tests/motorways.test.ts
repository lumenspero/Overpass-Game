import { afterEach, describe, expect, it } from 'vitest';
import {
  type Car,
  type CurvePoint,
  createSim,
  dropMotorwaysAt,
  findRoute,
  linkTiles,
  moveCars,
  motorwayCurve,
  nudgeMotorway,
  placeMotorway,
  placeRoads,
  removeRoads,
  resetTuning,
  restoreMotorway,
  type SimState,
  tuning,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

afterEach(() => resetTuning());

/** Land with a ground road along row 2 from x 1 to x 9. The motorway ramps are at x 1 and x 9. */
function town(): SimState {
  const sim = createSim({ seed: 1, grid: makeGrid(12, 8), roadBudget: 60 });
  sim.stock.motorway = 1;
  const row = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => at(sim.grid, x, 2));
  expect(placeRoads(sim, row).ok).toBe(true);
  for (let k = 1; k < row.length; k++) linkTiles(sim, row[k - 1], row[k]);
  return sim;
}

const ramps = (sim: SimState) => ({
  a: at(sim.grid, 1, 2),
  b: at(sim.grid, 9, 2),
});

/** A straight drag between the ramps. */
const straight: CurvePoint[] = [
  { x: 1.5, y: 2.5 },
  { x: 5.5, y: 2.5 },
  { x: 9.5, y: 2.5 },
];

/** Ticks until a car reaches `progress`, for timing a motorway against a ground route. */
function ticksTo(sim: SimState, route: number[], progress: number): number {
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
  let ticks = 0;
  while (car.progress < progress && ticks < 1000) {
    moveCars(sim);
    ticks += 1;
  }
  return ticks;
}

describe('placing a motorway', () => {
  it('uses one from stock and pays for the curve from budget', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    const before = sim.budget;
    const result = placeMotorway(sim, a, b, straight);
    expect(result.ok).toBe(true);
    expect(sim.motorways).toHaveLength(1);
    expect(sim.stock.motorway).toBe(0);
    if (result.ok) expect(sim.budget).toBe(before - result.cost);
  });

  it('needs both ramps to be ground roads', () => {
    const sim = town();
    const { b } = ramps(sim);
    const bare = at(sim.grid, 3, 5);
    expect(placeMotorway(sim, bare, b, straight)).toEqual({
      ok: false,
      reason: 'bad-endpoint',
    });
  });

  it('refuses ramps that touch each other', () => {
    const sim = town();
    expect(
      placeMotorway(sim, at(sim.grid, 3, 2), at(sim.grid, 4, 2), straight),
    ).toEqual({ ok: false, reason: 'bad-endpoint' });
  });

  it('needs a motorway in stock', () => {
    const sim = town();
    sim.stock.motorway = 0;
    const { a, b } = ramps(sim);
    expect(placeMotorway(sim, a, b, straight)).toEqual({
      ok: false,
      reason: 'no-stock',
    });
  });

  it('refuses a curve longer than the limit', () => {
    const sim = town();
    tuning.MOTORWAY_MAX_LENGTH = 5;
    const { a, b } = ramps(sim);
    expect(placeMotorway(sim, a, b, straight)).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  it('lets the drag shape the curve', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    const bulge: CurvePoint[] = [
      { x: 1.5, y: 2.5 },
      { x: 5.5, y: 0.5 },
      { x: 9.5, y: 2.5 },
    ];
    expect(placeMotorway(sim, a, b, bulge).ok).toBe(true);
    const curve = motorwayCurve(sim.grid, sim.motorways[0]);
    expect(Math.min(...curve.map((p) => p.y))).toBeLessThan(2);
  });
});

describe('routing and travel', () => {
  it('routes over a motorway when it is quicker than the ground', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    placeMotorway(sim, a, b, straight);
    const ground = findRoute(sim.grid, sim.roads, sim.links, a, b);
    const over = findRoute(sim.grid, sim.roads, sim.links, a, b, sim.motorways);
    expect(ground).not.toBeNull();
    expect(ground?.length).toBe(9);
    expect(over).toEqual([a, b]);
  });

  it('gets a car over the motorway faster than along the road', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    placeMotorway(sim, a, b, straight);
    const motorway = ticksTo(sim, [a, b], 1);

    const plain = town();
    const row = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => at(plain.grid, x, 2));
    const ground = ticksTo(plain, row, row.length - 1);
    expect(motorway).toBeLessThan(ground);
  });
});

describe('removing a motorway', () => {
  it('goes when a ramp is erased, returning its stock and budget', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    const result = placeMotorway(sim, a, b, straight);
    if (!result.ok) throw new Error('placement failed');
    const budget = sim.budget;
    removeRoads(sim, [a]);
    expect(sim.motorways).toHaveLength(0);
    expect(sim.stock.motorway).toBe(1);
    // The erased ramp gives back its road tile as well.
    expect(sim.budget).toBe(budget + result.cost + 1);
  });

  it('comes back when an undo restores it', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    placeMotorway(sim, a, b, straight);
    const [dropped] = dropMotorwaysAt(sim, [a]);
    expect(sim.motorways).toHaveLength(0);
    restoreMotorway(sim, dropped);
    expect(sim.motorways).toHaveLength(1);
    expect(sim.stock.motorway).toBe(0);
  });
});

describe('nudging a motorway', () => {
  it('moves one handle and keeps the rest', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    placeMotorway(sim, a, b, straight);
    const id = sim.motorways[0].id;
    const untouched = { ...sim.motorways[0].handles[1] };
    expect(nudgeMotorway(sim, id, 0, { x: 3.5, y: 0.5 }).ok).toBe(true);
    expect(sim.motorways[0].handles[0]).toEqual({ x: 3.5, y: 0.5 });
    expect(sim.motorways[0].handles[1]).toEqual(untouched);
  });

  it('refuses a handle that takes the curve off the map', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    placeMotorway(sim, a, b, straight);
    const id = sim.motorways[0].id;
    expect(nudgeMotorway(sim, id, 0, { x: 3.5, y: -2 })).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
  });

  it('refuses a nudge that makes the curve too long', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    placeMotorway(sim, a, b, straight);
    tuning.MOTORWAY_MAX_LENGTH = 9;
    const id = sim.motorways[0].id;
    expect(nudgeMotorway(sim, id, 1, { x: 5.5, y: 6.5 })).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  it('refuses a handle that does not exist', () => {
    const sim = town();
    const { a, b } = ramps(sim);
    placeMotorway(sim, a, b, straight);
    const id = sim.motorways[0].id;
    expect(nudgeMotorway(sim, id, 9, { x: 1, y: 1 })).toEqual({
      ok: false,
      reason: 'bad-handle',
    });
  });
});

describe('a motorway meets its ramps along the road', () => {
  it('arrives at each ramp in the direction of the road it joins', () => {
    const grid = makeGrid(14, 8);
    const sim = createSim({ seed: 1, grid, roadBudget: 80 });
    sim.stock.motorway = 1;
    const row = [];
    for (let x = 0; x < 14; x++) row.push(at(grid, x, 2));
    placeRoads(sim, row);
    for (let x = 1; x < 14; x++)
      linkTiles(sim, at(grid, x - 1, 2), at(grid, x, 2));
    // Handles pulled well off the road, so the ends would meet it at an angle without the fix.
    const r = placeMotorway(sim, at(grid, 2, 2), at(grid, 11, 2), [
      { x: 3.5, y: 4.5 },
      { x: 6.5, y: 4.5 },
      { x: 10.5, y: 4.5 },
    ]);
    expect(r.ok).toBe(true);
    const curve = motorwayCurve(grid, sim.motorways[0]);
    const near = (p: CurvePoint, q: CurvePoint) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      return { x: (q.x - p.x) / d, y: (q.y - p.y) / d };
    };
    const m = sim.motorways[0];
    const plain = motorwayCurve(grid, { ...m, aDir: null, bDir: null });
    const startOff = (c: CurvePoint[]) => Math.abs(near(c[0], c[1]).y);
    const endOff = (c: CurvePoint[]) =>
      Math.abs(near(c[c.length - 2], c[c.length - 1]).y);
    expect(startOff(curve)).toBeLessThan(startOff(plain));
    expect(endOff(curve)).toBeLessThan(endOff(plain));
    expect(startOff(curve)).toBeLessThan(0.2);
    expect(endOff(curve)).toBeLessThan(0.2);
  });
});
