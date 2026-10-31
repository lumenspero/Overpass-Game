import { createGrid, createSim, placeBuilding } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { applyIntent, createController } from './controller.ts';

const COLS = 7;
const idx = (x: number, y: number) => y * COLS + x;
const identity = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });

describe('pressing the destination tool', () => {
  it('upgrades the destination pressed and reports it', () => {
    const sim = createSim({
      seed: 1,
      grid: createGrid(COLS, 7),
      roadBudget: 80,
    });
    const dest = placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: idx(5, 5),
      entrance: 'w',
    });
    if (!dest.ok) throw new Error('setup failed');
    sim.stock.destination = 1;
    const ctl = createController(sim);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'destination', at: { x: 5.5, y: 5.5 } },
      identity,
    );
    expect(sim.demand[dest.id].upgrades).toBe(1);
    expect(sim.stock.destination).toBe(0);
    expect(ctl.crossing?.kind).toBe('destination');
  });

  it('reports a press on empty ground as not a destination', () => {
    const sim = createSim({
      seed: 1,
      grid: createGrid(COLS, 7),
      roadBudget: 80,
    });
    sim.stock.destination = 1;
    const ctl = createController(sim);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'destination', at: { x: 1.5, y: 1.5 } },
      identity,
    );
    expect(ctl.crossing?.kind).toBe('destination');
    expect(sim.stock.destination).toBe(1);
  });
});
