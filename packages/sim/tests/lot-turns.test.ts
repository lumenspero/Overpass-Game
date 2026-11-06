import { describe, expect, it } from 'vitest';
import {
  createSim,
  linkTiles,
  lotApproach,
  placeBuilding,
  placeRoads,
  step,
  type LotPoint,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

/** The sharpest change of heading between consecutive segments of a path, in degrees. */
function sharpestTurn(path: readonly LotPoint[]): number {
  let worst = 0;
  let prev: { x: number; y: number } | null = null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const dir = { x: dx / len, y: dy / len };
    if (prev) {
      const cos = Math.max(-1, Math.min(1, prev.x * dir.x + prev.y * dir.y));
      worst = Math.max(worst, (Math.acos(cos) * 180) / Math.PI);
    }
    prev = dir;
  }
  return worst;
}

describe('turning into a lot', () => {
  it('turns into a lot on its own side in one smooth curve, without running on and pivoting', () => {
    // A car drives east along row 2 and turns right, into a lot below the road at (3,3).
    const sim = createSim({ seed: 1, grid: makeGrid(8, 8), roadBudget: 100 });
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 0, 2),
      entrance: 'e',
    });
    placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 3, 3),
      entrance: 'n',
    });
    const road = [at(sim.grid, 1, 2), at(sim.grid, 2, 2), at(sim.grid, 3, 2)];
    placeRoads(sim, road);
    for (let i = 1; i < road.length; i++)
      linkTiles(sim, road[i - 1] ?? 0, road[i] ?? 0);
    sim.demand[1].pins = 1;
    let path: readonly LotPoint[] | null = null;
    for (let i = 0; i < 3000 && path === null; i++) {
      step(sim);
      const lot = sim.cars[0]?.lot;
      if (lot && lot.phase === 'in') path = lot.path;
    }
    if (path === null) throw new Error('no car entered the lot');
    expect(sharpestTurn(path)).toBeLessThan(30);
  });
});

describe('the approach into a lot', () => {
  // The lot at (3,3) faces north: its access node is (3,2) and its inlet (3,3). Drawn with its inlet tab,
  // the node is a bend: a road band from 0.25 to 0.75 tiles round the tile corner the road turns about.
  const sim = createSim({ seed: 1, grid: makeGrid(8, 8), roadBudget: 0 });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(sim.grid, 3, 3),
    entrance: 'n',
  });
  const lot = sim.buildings[0];
  const node = at(sim.grid, 3, 2);

  for (const [name, from, corner] of [
    [
      'across the road (a left turn, heading west)',
      at(sim.grid, 4, 2),
      { x: 4, y: 3 },
    ],
    [
      'on its own side (a right turn, heading east)',
      at(sim.grid, 2, 2),
      { x: 3, y: 3 },
    ],
  ] as const) {
    it(`keeps inside the bend's road band, clear of both edges, ${name}`, () => {
      if (!lot) throw new Error('setup failed');
      const path = lotApproach(sim.grid, lot, 'near', from, node);
      if (!path) throw new Error('no approach');
      const onNode = path.filter(
        (p) => p.x >= 3 && p.x <= 4 && p.y >= 2 && p.y <= 3,
      );
      expect(onNode.length).toBeGreaterThan(2);
      // A car is about 0.1 tiles wide either side of its lane, so it keeps 0.1 inside each edge.
      for (const p of onNode) {
        const r = Math.hypot(p.x - corner.x, p.y - corner.y);
        expect(r).toBeGreaterThanOrEqual(0.35 - 1e-9);
        expect(r).toBeLessThanOrEqual(0.65 + 1e-9);
      }
    });
  }
});
