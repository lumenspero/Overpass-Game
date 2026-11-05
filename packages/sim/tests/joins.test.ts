import { describe, expect, it } from 'vitest';
import { createSim, joinClear, type Car, type SimState } from '../src/index.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

/**
 * A straight row of road across a 9×5 world, on row 2. A car joins the road on tile 4 heading west, to
 * tile 3, so its lane is the westbound one and the other lane carries cars eastbound.
 */
function row(): { sim: SimState; east: number[]; west: number[] } {
  const sim = createSim({ seed: 1, grid: makeGrid(9, 5), roadBudget: 100 });
  const east = Array.from({ length: 9 }, (_, x) => at(sim.grid, x, 2));
  drawRoads(sim, east);
  return { sim, east, west: [...east].reverse() };
}

function carOn(
  sim: SimState,
  route: number[],
  progress: number,
  along: number,
): Car {
  const car: Car = {
    id: sim.nextCarId,
    house: 0,
    destination: 1,
    state: 'driving',
    route,
    progress,
    along,
    timer: 0,
  };
  sim.nextCarId += 1;
  sim.cars.push(car);
  return car;
}

/** Whether a car may join on tile 4 heading west, crossing the eastbound lane at the centre when `crosses`. */
function mayJoin(
  sim: SimState,
  crosses = false,
  patience: 0 | 1 | 2 = 0,
): boolean {
  const tile = at(sim.grid, 4, 2);
  const to = at(sim.grid, 3, 2);
  return joinClear(sim, tile, to, null, crosses ? 0.5 : null, 0.5, patience);
}

describe('joining the road', () => {
  it('joins when the road is clear', () => {
    const { sim } = row();
    expect(mayJoin(sim)).toBe(true);
    expect(mayJoin(sim, true)).toBe(true);
  });

  it('waits for a car in its lane short of where it would join', () => {
    const { sim, west } = row();
    // West route index 4 is tile x = 4.
    carOn(sim, west, 4, 0.3);
    expect(mayJoin(sim)).toBe(false);
  });

  it('joins behind a car in its lane that is a gap beyond where it joins', () => {
    const { sim, west } = row();
    carOn(sim, west, 4, 0.95);
    expect(mayJoin(sim)).toBe(true);
  });

  it('waits for a car in its lane about to drive on to the tile', () => {
    const { sim, west } = row();
    // Tile x = 5, at its far edge, heading on to tile 4.
    carOn(sim, west, 3, 0.9);
    expect(mayJoin(sim)).toBe(false);
  });

  it('ignores the other lane when it does not cross it', () => {
    const { sim, east } = row();
    carOn(sim, east, 4, 0.3);
    expect(mayJoin(sim)).toBe(true);
  });

  it('waits for a moving car in the lane it crosses', () => {
    const { sim, east } = row();
    carOn(sim, east, 4, 0.3);
    expect(mayJoin(sim, true)).toBe(false);
  });

  it('waits for a stopped car at its crossing point until it is patient', () => {
    const { sim, east } = row();
    // A car stopped one gap behind another, at the tile's centre, where the joining car crosses.
    carOn(sim, east, 4, 0.95);
    carOn(sim, east, 4, 0.55);
    expect(mayJoin(sim, true, 0)).toBe(false);
    expect(mayJoin(sim, true, 1)).toBe(true);
  });

  it('merges into a stopped queue in its lane only once forced, in gridlock', () => {
    const { sim, west } = row();
    carOn(sim, west, 4, 0.95);
    carOn(sim, west, 4, 0.55);
    expect(mayJoin(sim, false, 0)).toBe(false);
    expect(mayJoin(sim, false, 1)).toBe(false);
    expect(mayJoin(sim, false, 2)).toBe(true);
  });

  it('never cuts in on a moving car in its lane, even when forced', () => {
    const { sim, west } = row();
    carOn(sim, west, 4, 0.5);
    expect(mayJoin(sim, false, 2)).toBe(false);
  });
});
