import { describe, expect, it } from 'vitest';
import {
  type Car,
  createSim,
  findRoute,
  routeCost,
  linkTiles,
  placeRoads,
  waitingCounts,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/**
 * Two ways from (0, 2) to (6, 2): straight along row 2 (6 steps), or down to row 3, along it
 * and back up (8 steps). The straight way passes (3, 2).
 */
function twoWays() {
  const grid = makeGrid(7, 5);
  const sim = createSim({ seed: 1, grid, roadBudget: 80 });
  const straight: number[] = [];
  const detour: number[] = [];
  for (let x = 0; x < 7; x++) {
    straight.push(at(grid, x, 2));
    detour.push(at(grid, x, 3));
  }
  placeRoads(sim, [...straight, ...detour]);
  for (let x = 1; x < 7; x++) {
    linkTiles(sim, at(grid, x - 1, 2), at(grid, x, 2));
    linkTiles(sim, at(grid, x - 1, 3), at(grid, x, 3));
  }
  linkTiles(sim, at(grid, 0, 2), at(grid, 0, 3));
  linkTiles(sim, at(grid, 6, 2), at(grid, 6, 3));
  return { grid, sim, straightMid: at(grid, 3, 2) };
}

function waitingAt(grid: ReturnType<typeof makeGrid>, tile: number, n: number) {
  const waiting = new Array<number>(grid.cols * grid.rows).fill(0);
  waiting[tile] = n;
  return waiting;
}

describe('congestion-aware routing', () => {
  it('counts a car at the end of its tile as waiting for the next one', () => {
    const { grid, sim, straightMid } = twoWays();
    const car: Car = {
      id: 0,
      house: 0,
      destination: 0,
      state: 'driving',
      route: [at(grid, 2, 2), straightMid],
      progress: 0,
      along: 1,
      timer: 0,
    };
    sim.cars.push(car);
    expect(waitingCounts(sim)[straightMid]).toBe(1);
  });

  it('keeps the straight way with one car waiting, since the detour is longer', () => {
    const { grid, sim, straightMid } = twoWays();
    const route = findRoute(
      grid,
      sim.roads,
      sim.links,
      at(grid, 0, 2),
      at(grid, 6, 2),
      [],
      waitingAt(grid, straightMid, 1),
    );
    expect(route).toContain(straightMid);
  });

  it('takes the detour once the queue outweighs the extra distance', () => {
    const { grid, sim, straightMid } = twoWays();
    const route = findRoute(
      grid,
      sim.roads,
      sim.links,
      at(grid, 0, 2),
      at(grid, 6, 2),
      [],
      waitingAt(grid, straightMid, 2),
    );
    expect(route).not.toContain(straightMid);
  });
});

describe('the cost a route is judged by', () => {
  it('adds the queue on each tile it enters, so a queue can make the straight way dearer', () => {
    const { grid, straightMid } = twoWays();
    const straight = [];
    for (let x = 0; x < 7; x++) straight.push(at(grid, x, 2));
    const waiting = waitingAt(grid, straightMid, 2);
    // Six steps, plus three for the two cars queued at (3, 2).
    expect(routeCost(grid, straight, [], waiting)).toBeCloseTo(9);
    expect(routeCost(grid, straight, [], [])).toBeCloseTo(6);
  });
});
