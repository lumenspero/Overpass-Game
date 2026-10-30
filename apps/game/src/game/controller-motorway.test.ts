import {
  createGrid,
  createSim,
  motorwayCurve,
  placeRoads,
  type SimState,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { applyIntent, createController } from './controller.ts';

const COLS = 8;
const idx = (x: number, y: number) => y * COLS + x;
const identity = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });

/** An 8x8 map with ground roads at the two ramps, (1,4) and (6,4), and one motorway in stock. */
function town(): SimState {
  const sim = createSim({
    seed: 1,
    grid: createGrid(COLS, COLS),
    roadBudget: 100,
  });
  sim.stock.motorway = 1;
  expect(placeRoads(sim, [idx(1, 4), idx(6, 4)]).ok).toBe(true);
  return sim;
}

/** Lays a motorway from (1,4) to (6,4) by dragging up and over, as a player would. */
function layMotorway(sim: SimState) {
  const ctl = createController(sim);
  applyIntent(
    ctl,
    { type: 'stroke-begin', mode: 'motorway', at: { x: 1.5, y: 4.5 } },
    identity,
  );
  for (const p of [
    { x: 3.5, y: 2.5 },
    { x: 5.5, y: 2.5 },
  ]) {
    applyIntent(ctl, { type: 'stroke-move', at: p }, identity);
  }
  applyIntent(ctl, { type: 'stroke-end', at: { x: 6.5, y: 4.5 } }, identity);
  return ctl;
}

describe('motorway strokes', () => {
  it('a drag between two ramps lays a motorway shaped by the drag', () => {
    const sim = town();
    const ctl = layMotorway(sim);
    expect(sim.motorways).toHaveLength(1);
    expect(ctl.crossing?.kind).toBe('motorway');
    expect(ctl.crossing?.result.ok).toBe(true);
  });

  it('a press on a curve selects it, and a press on a handle nudges that handle', () => {
    const sim = town();
    const ctl = layMotorway(sim);
    const m = sim.motorways[0];
    const curve = motorwayCurve(sim.grid, m);
    const mid = curve[Math.floor(curve.length / 2)];

    applyIntent(ctl, { type: 'stroke-begin', mode: 'draw', at: mid }, identity);
    applyIntent(ctl, { type: 'stroke-end' }, identity);
    expect(ctl.selected).toBe(m.id);

    const h = m.handles[0];
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'draw', at: { x: h.x, y: h.y } },
      identity,
    );
    applyIntent(
      ctl,
      { type: 'stroke-move', at: { x: h.x, y: h.y + 0.5 } },
      identity,
    );
    applyIntent(
      ctl,
      { type: 'stroke-end', at: { x: h.x, y: h.y + 0.5 } },
      identity,
    );
    expect(sim.motorways[0].handles[0].y).toBeCloseTo(h.y + 0.5);
  });

  it('a press on empty ground deselects the motorway', () => {
    const sim = town();
    const ctl = layMotorway(sim);
    const m = sim.motorways[0];
    const mid = motorwayCurve(sim.grid, m)[10];
    applyIntent(ctl, { type: 'stroke-begin', mode: 'draw', at: mid }, identity);
    applyIntent(ctl, { type: 'stroke-end' }, identity);
    expect(ctl.selected).toBe(m.id);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'draw', at: { x: 0.5, y: 0.5 } },
      identity,
    );
    expect(ctl.selected).toBeNull();
  });

  it('cancelling an erase of a ramp brings the motorway back with its stock', () => {
    const sim = town();
    const ctl = layMotorway(sim);
    expect(sim.stock.motorway).toBe(0);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'erase', at: { x: 1.5, y: 4.5 } },
      identity,
    );
    expect(sim.motorways).toHaveLength(0);
    expect(sim.stock.motorway).toBe(1);
    applyIntent(ctl, { type: 'stroke-cancel' }, identity);
    expect(sim.motorways).toHaveLength(1);
    expect(sim.stock.motorway).toBe(0);
  });

  it('erasing a motorway by its curve removes it and returns its stock, and cancel brings it back', () => {
    const sim = town();
    const ctl = layMotorway(sim);
    const mid = motorwayCurve(sim.grid, sim.motorways[0])[10];
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'erase', at: mid },
      identity,
    );
    expect(sim.motorways).toHaveLength(0);
    expect(sim.stock.motorway).toBe(1);
    applyIntent(ctl, { type: 'stroke-cancel' }, identity);
    expect(sim.motorways).toHaveLength(1);
    expect(sim.stock.motorway).toBe(0);
  });

  it('a select stroke on empty ground lays no road', () => {
    const sim = town();
    const ctl = createController(sim);
    const before = sim.roads.reduce((n, r) => n + r, 0);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'select', at: { x: 0.5, y: 0.5 } },
      identity,
    );
    applyIntent(ctl, { type: 'stroke-move', at: { x: 2.5, y: 0.5 } }, identity);
    applyIntent(ctl, { type: 'stroke-end', at: { x: 2.5, y: 0.5 } }, identity);
    expect(sim.roads.reduce((n, r) => n + r, 0)).toBe(before);
  });
});
