import { createGrid, createSim, type SimState } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { applyIntent, createController } from './controller.ts';

const COLS = 8;
const idx = (x: number, y: number) => y * COLS + x;
const identity = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });

function blank(): SimState {
  return createSim({ seed: 1, grid: createGrid(COLS, COLS), roadBudget: 100 });
}

describe('road drawing with the default tool', () => {
  it('lays nothing for a click that never moves', () => {
    const sim = blank();
    const ctl = createController(sim);
    const at = { x: 1.5, y: 1.5 };
    applyIntent(ctl, { type: 'stroke-begin', mode: 'select', at }, identity);
    applyIntent(ctl, { type: 'stroke-end', at }, identity);
    expect([...sim.roads].every((r) => r === 0)).toBe(true);
  });

  it('draws road from the press to the pointer once it is dragged, and stops on release', () => {
    const sim = blank();
    const ctl = createController(sim);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'select', at: { x: 1.5, y: 1.5 } },
      identity,
    );
    expect(sim.roads[idx(1, 1)]).toBe(0);
    applyIntent(ctl, { type: 'stroke-move', at: { x: 2.5, y: 1.5 } }, identity);
    applyIntent(ctl, { type: 'stroke-move', at: { x: 3.5, y: 1.5 } }, identity);
    applyIntent(ctl, { type: 'stroke-end', at: { x: 3.5, y: 1.5 } }, identity);
    expect(sim.roads[idx(1, 1)]).toBe(1);
    expect(sim.roads[idx(2, 1)]).toBe(1);
    expect(sim.roads[idx(3, 1)]).toBe(1);
    expect(ctl.stroke).toBeNull();
    // After release, a further move draws nothing.
    applyIntent(ctl, { type: 'stroke-move', at: { x: 5.5, y: 1.5 } }, identity);
    expect(sim.roads[idx(5, 1)]).toBe(0);
  });
});
