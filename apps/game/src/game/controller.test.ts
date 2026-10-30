import {
  createGrid,
  createSim,
  Terrain,
  type TerrainKind,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import type { Intent, StrokeMode } from '../input/intents.ts';
import {
  applyIntent,
  createController,
  type Controller,
} from './controller.ts';

// In these tests a point is a tile's coordinates: move(2, 2) is the centre of tile (2, 2).
const identity = (p: { x: number; y: number }) => ({
  x: p.x + 0.5,
  y: p.y + 0.5,
});

function setup(
  opts: {
    cols?: number;
    rows?: number;
    budget?: number;
    blocked?: Array<[number, number, TerrainKind]>;
  } = {},
): Controller {
  const grid = createGrid(opts.cols ?? 6, opts.rows ?? 4, Terrain.Land);
  for (const [x, y, kind] of opts.blocked ?? []) {
    grid.terrain[y * grid.cols + x] = kind;
  }
  const sim = createSim({ seed: 1, grid, roadBudget: opts.budget ?? 20 });
  return createController(sim);
}

function run(ctl: Controller, intents: Intent[]): boolean[] {
  return intents.map((i) => applyIntent(ctl, i, identity));
}

const begin = (mode: StrokeMode, x: number, y: number): Intent => ({
  type: 'stroke-begin',
  mode,
  at: { x, y },
});
const move = (x: number, y: number): Intent => ({
  type: 'stroke-move',
  at: { x, y },
});
const roadTiles = (ctl: Controller): number[] =>
  ctl.sim.roads.flatMap((r, i) => (r === 1 ? [i] : []));

describe('drawing', () => {
  it('a tap places one road tile', () => {
    const ctl = setup();
    run(ctl, [begin('draw', 2, 1), { type: 'stroke-end' }]);
    expect(roadTiles(ctl)).toEqual([1 * 6 + 2]);
    expect(ctl.sim.budget).toBe(19);
  });

  it('a drag places every tile along the path and charges each once', () => {
    const ctl = setup();
    run(ctl, [begin('draw', 0, 0), move(3, 0), { type: 'stroke-end' }]);
    expect(roadTiles(ctl)).toEqual([0, 1, 2, 3]);
    expect(ctl.sim.budget).toBe(16);
  });

  it('a diagonal drag produces a 4-connected road', () => {
    const ctl = setup();
    run(ctl, [begin('draw', 0, 0), move(2, 2), { type: 'stroke-end' }]);
    // A diagonal drag is a diagonal road: three tiles, with no filler tiles.
    expect(roadTiles(ctl)).toHaveLength(3);
    // One connected road: two end nodes, one edge through the middle tile.
    expect(Object.keys(ctl.sim.graph.nodes)).toHaveLength(2);
    expect(Object.keys(ctl.sim.graph.edges)).toHaveLength(1);
  });

  it('does not charge for tiles that are already roads', () => {
    const ctl = setup();
    run(ctl, [begin('draw', 0, 0), move(1, 0), { type: 'stroke-end' }]);
    run(ctl, [begin('draw', 0, 0), move(2, 0), { type: 'stroke-end' }]);
    expect(roadTiles(ctl)).toEqual([0, 1, 2]);
    expect(ctl.sim.budget).toBe(17);
  });

  it('stops at water and keeps the roads already placed', () => {
    const ctl = setup({ blocked: [[3, 0, Terrain.Water]] });
    run(ctl, [begin('draw', 0, 0), move(5, 0), move(5, 0)]);
    expect(roadTiles(ctl)).toEqual([0, 1, 2]);
    expect(ctl.sim.budget).toBe(17);
  });

  it('a stroke halted by water stays halted until a new stroke begins', () => {
    const ctl = setup({ blocked: [[2, 0, Terrain.Mountain]] });
    run(ctl, [begin('draw', 0, 0), move(3, 0)]);
    expect(run(ctl, [move(3, 0)])).toEqual([false]);
    run(ctl, [
      { type: 'stroke-end' },
      begin('draw', 3, 0),
      { type: 'stroke-end' },
    ]);
    expect(roadTiles(ctl)).toEqual([0, 1, 3]);
  });

  it('stops when the budget runs out', () => {
    const ctl = setup({ budget: 2 });
    run(ctl, [begin('draw', 0, 0), move(4, 0), { type: 'stroke-end' }]);
    expect(roadTiles(ctl)).toEqual([0, 1]);
    expect(ctl.sim.budget).toBe(0);
  });

  it('never leaves the grid', () => {
    const ctl = setup();
    run(ctl, [begin('draw', -2, 0), move(2, 0)]);
    expect(roadTiles(ctl)).toEqual([]);
  });
});

describe('erasing', () => {
  it('removes roads along the path and refunds each one', () => {
    const ctl = setup();
    run(ctl, [begin('draw', 0, 0), move(3, 0), { type: 'stroke-end' }]);
    run(ctl, [begin('erase', 0, 0), move(3, 0), { type: 'stroke-end' }]);
    expect(roadTiles(ctl)).toEqual([]);
    expect(ctl.sim.budget).toBe(20);
  });

  it('erasing empty tiles changes nothing', () => {
    const ctl = setup();
    expect(run(ctl, [begin('erase', 4, 3), { type: 'stroke-end' }])).toEqual([
      false,
      false,
    ]);
    expect(ctl.sim.budget).toBe(20);
  });
});

describe('cancel', () => {
  it('rolls back a drawn stroke completely, budget included', () => {
    const ctl = setup();
    run(ctl, [begin('draw', 0, 0), move(3, 0), { type: 'stroke-cancel' }]);
    expect(roadTiles(ctl)).toEqual([]);
    expect(ctl.sim.budget).toBe(20);
    expect(Object.keys(ctl.sim.graph.edges)).toHaveLength(0);
    expect(ctl.stroke).toBeNull();
  });

  it('restores roads a cancelled erase stroke had removed', () => {
    const ctl = setup();
    run(ctl, [begin('draw', 0, 0), move(2, 0), { type: 'stroke-end' }]);
    run(ctl, [begin('erase', 0, 0), move(2, 0), { type: 'stroke-cancel' }]);
    expect(roadTiles(ctl)).toEqual([0, 1, 2]);
    expect(ctl.sim.budget).toBe(17);
  });

  it('a cancel after a completed stroke leaves that stroke alone', () => {
    const ctl = setup();
    run(ctl, [begin('draw', 0, 0), move(1, 0), { type: 'stroke-end' }]);
    run(ctl, [{ type: 'stroke-cancel' }]);
    expect(roadTiles(ctl)).toEqual([0, 1]);
  });

  it('a cancel with no stroke does nothing', () => {
    const ctl = setup();
    expect(run(ctl, [{ type: 'stroke-cancel' }])).toEqual([false]);
  });
});

describe('settling near tile centres', () => {
  it('a wobbling diagonal drag leaves only the diagonal tiles', () => {
    const ctl = setup();
    // Pointer positions in tile units, given to move() as offsets from a centre.
    // (1.0, 0.9) and (2.0, 1.6) brush the edges of neighbouring tiles, so they take nothing.
    run(ctl, [
      begin('draw', 0, 0),
      move(0.5, 0.4), // (1.0, 0.9): near the edge of tile (1,0)
      move(1, 1), // (1.5, 1.5): settles on tile (1,1)
      move(1.5, 1.1), // (2.0, 1.6): near the edge of tile (2,1)
      move(2, 2), // (2.5, 2.5): settles on tile (2,2)
      { type: 'stroke-end' },
    ]);
    // On a 6-column grid: (0,0) = 0, (1,1) = 7, (2,2) = 14.
    expect(roadTiles(ctl)).toEqual([0, 7, 14]);
  });
});

describe('settle radius', () => {
  it('a pointer in a tile corner, away from its centre, takes nothing', () => {
    const ctl = setup();
    // (1.69, 1.21) is inside tile (1,1) but 0.35 tiles from its centre: outside the radius.
    run(ctl, [begin('draw', 0, 0), move(1.19, 0.71), { type: 'stroke-end' }]);
    expect(roadTiles(ctl)).toEqual([0]);
  });
});
