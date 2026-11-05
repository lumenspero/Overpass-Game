import { afterEach, describe, expect, it } from 'vitest';
import {
  createSim,
  currentFence,
  fenceAt,
  fenceEdge,
  fenceSteps,
  isOpenTile,
  placeBuilding,
  placeRoads,
  resetTuning,
  step,
  tuning,
  WEEK_TICKS,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

const REVEAL = tuning.FENCE_REVEAL_TICKS;

/**
 * An 8x5 grid whose start fence is columns 0-1. A house sits on column 0 facing east, and a
 * destination on column 3 facing north, so the destination starts outside the fence.
 */
function strip(): SimState {
  const grid = makeGrid(8, 5);
  const sim = createSim({
    seed: 1,
    grid,
    roadBudget: 100,
    startFence: { col: 0, row: 0, cols: 2, rows: 5 },
  });
  placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(grid, 0, 1),
    entrance: 'e',
  });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(grid, 3, 2),
    entrance: 'n',
  });
  return sim;
}

/** The tick at which growth step `n` (counting from 1) has finished its reveal. */
function stepDone(n: number): number {
  return (n * WEEK_TICKS) / tuning.FENCE_GROWTH_PER_WEEK + REVEAL;
}

function atTick(sim: SimState, tick: number): void {
  sim.tick = tick;
}

describe('the fence', () => {
  afterEach(() => resetTuning());

  it('grows two steps a week by default, one node a side per step', () => {
    expect(tuning.FENCE_GROWTH_PER_WEEK).toBe(2);
    expect(fenceSteps(0)).toBe(0);
    expect(fenceSteps(WEEK_TICKS / 2)).toBe(0); // the first step is still sliding
    expect(fenceSteps(stepDone(1) - 1)).toBe(0);
    expect(fenceSteps(stepDone(1))).toBe(1);
    expect(fenceSteps(stepDone(2))).toBe(2);
    expect(fenceSteps(stepDone(6))).toBe(6);
  });

  it('grows the start fence in the open directions, stopping at the left and top edges', () => {
    const sim = strip();
    expect(fenceAt(sim, 0)).toEqual({ col: 0, row: 0, cols: 2, rows: 5 });
    expect(fenceAt(sim, stepDone(1))).toEqual({
      col: 0,
      row: 0,
      cols: 3,
      rows: 5,
    });
    expect(fenceAt(sim, stepDone(2))).toEqual({
      col: 0,
      row: 0,
      cols: 4,
      rows: 5,
    });
  });

  it('grows on all four sides when the start fence is in the middle', () => {
    const grid = makeGrid(10, 10);
    const sim = createSim({
      seed: 1,
      grid,
      roadBudget: 10,
      startFence: { col: 4, row: 4, cols: 2, rows: 2 },
    });
    expect(fenceAt(sim, stepDone(1))).toEqual({
      col: 3,
      row: 3,
      cols: 4,
      rows: 4,
    });
    expect(fenceAt(sim, stepDone(2))).toEqual({
      col: 2,
      row: 2,
      cols: 6,
      rows: 6,
    });
  });

  it('stops at the map edge', () => {
    const sim = strip();
    expect(fenceAt(sim, 100 * WEEK_TICKS)).toEqual({
      col: 0,
      row: 0,
      cols: 8,
      rows: 5,
    });
  });

  it('slides the edge across the next strip during its reveal, and opens the tiles at the end', () => {
    const sim = strip();
    // Halfway through the first reveal the edge is halfway across column 2, and column 2 is still locked.
    atTick(sim, WEEK_TICKS / 2 + REVEAL / 2);
    const mid = fenceEdge(sim, sim.tick);
    expect(mid.right).toBeCloseTo(2.5);
    expect(mid.left).toBe(0);
    expect(isOpenTile(sim, at(sim.grid, 2, 0))).toBe(false);
    // When the reveal finishes, the edge is on column 3 and the tiles open.
    atTick(sim, stepDone(1));
    expect(fenceEdge(sim, sim.tick).right).toBe(3);
    expect(isOpenTile(sim, at(sim.grid, 2, 0))).toBe(true);
  });

  it('keeps the edge continuous from one step to the next', () => {
    const sim = strip();
    const before = fenceEdge(sim, stepDone(1) - 1);
    const after = fenceEdge(sim, stepDone(1));
    expect(after.right - before.right).toBeCloseTo(0, 1);
  });

  it('refuses roads outside the fence, and allows them once it grows over them', () => {
    const sim = strip();
    atTick(sim, 0);
    expect(placeRoads(sim, [at(sim.grid, 2, 1)])).toEqual({
      ok: false,
      reason: 'locked',
    });
    atTick(sim, stepDone(2));
    expect(placeRoads(sim, [at(sim.grid, 2, 1)])).toEqual({
      ok: true,
      added: 1,
    });
  });

  it('keeps a destination outside the fence from collecting pins', () => {
    const sim = strip();
    atTick(sim, 0);
    for (let i = 0; i < tuning.DEMAND_INTERVAL_TICKS * 3; i++) step(sim);
    expect(sim.demand[1].pins).toBe(0);
  });

  it('keeps the whole grid open by default', () => {
    const grid = makeGrid(3, 1);
    const sim = createSim({ seed: 1, grid, roadBudget: 10 });
    expect(currentFence(sim)).toEqual({ col: 0, row: 0, cols: 3, rows: 1 });
    expect(placeRoads(sim, [0, 1, 2])).toEqual({ ok: true, added: 3 });
  });

  it('reads the growth rate and reveal from tuning, so the debug panel can move them', () => {
    tuning.FENCE_GROWTH_PER_WEEK = 0;
    expect(fenceSteps(10 * WEEK_TICKS)).toBe(0);
    tuning.FENCE_GROWTH_PER_WEEK = 2;
    tuning.FENCE_REVEAL_TICKS = 100;
    expect(fenceSteps(WEEK_TICKS / 2 + 99)).toBe(0);
    expect(fenceSteps(WEEK_TICKS / 2 + 100)).toBe(1);
  });
});
