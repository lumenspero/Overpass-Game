import { describe, expect, it } from 'vitest';
import type { Side } from '../src/buildings.ts';
import { createGrid, type Grid } from '../src/grid.ts';
import { accessTile, createSim, placeBuilding, Terrain } from '../src/index.ts';
import {
  BUILDING_SIZE,
  LOT_DEPTH,
  LOT_LENGTH,
  lotAt,
  lotBlocker,
  PARKING_SPACES,
  stripLayout,
  STRIP_LENGTH,
} from '../src/lots.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

const SIDES: Side[] = ['n', 'e', 's', 'w'];

/** Whether two tiles touch along an edge. */
function touches(grid: Grid, a: number, b: number): boolean {
  const dx = Math.abs((a % grid.cols) - (b % grid.cols));
  const dy = Math.abs(Math.floor(a / grid.cols) - Math.floor(b / grid.cols));
  return dx + dy === 1;
}

/** A 9×9 map, with the lot's top-left at (3, 3) so every side has room for its road. */
const grid = createGrid(9, 9);
const origin = 3 * grid.cols + 3;

describe('lotAt', () => {
  it('is 5 long and 3 deep, with a 3×3 building and a 2×3 strip', () => {
    expect(LOT_LENGTH).toBe(5);
    expect(LOT_DEPTH).toBe(3);
    expect(BUILDING_SIZE).toBe(3);
    expect(STRIP_LENGTH).toBe(2);
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      expect(lot).not.toBeNull();
      if (!lot) continue;
      expect(lot.tiles).toHaveLength(15);
      expect(new Set(lot.tiles).size).toBe(15);
      expect(lot.footprint).toHaveLength(9);
      expect(lot.strip).toHaveLength(6);
    }
  });

  it('splits the lot into the building and the strip, with nothing shared', () => {
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      if (!lot) throw new Error(`no lot for ${side}`);
      expect([...lot.footprint, ...lot.strip].sort((a, b) => a - b)).toEqual(
        [...lot.tiles].sort((a, b) => a - b),
      );
    }
  });

  it('puts the inlet in the strip, on the road edge, touching the road', () => {
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      if (!lot) throw new Error(`no lot for ${side}`);
      expect(lot.strip).toContain(lot.inlet);
      expect(lot.tiles).not.toContain(lot.road);
      expect(touches(grid, lot.inlet, lot.road)).toBe(true);
    }
  });

  it('puts the inlet at the strip end farthest from the building', () => {
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      if (!lot) throw new Error(`no lot for ${side}`);
      // The farthest strip tile from any building tile, by its distance along the lot.
      const distance = (t: number, buildingTiles: number[]) =>
        Math.min(
          ...buildingTiles.map(
            (b) =>
              Math.abs((t % grid.cols) - (b % grid.cols)) +
              Math.abs(Math.floor(t / grid.cols) - Math.floor(b / grid.cols)),
          ),
        );
      const inletDistance = distance(lot.inlet, lot.footprint);
      for (const s of lot.strip) {
        expect(distance(s, lot.footprint)).toBeLessThanOrEqual(inletDistance);
      }
    }
  });

  it('keeps the building away from the road, so the strip is between them', () => {
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      if (!lot) throw new Error(`no lot for ${side}`);
      expect(lot.footprint.some((f) => touches(grid, f, lot.road))).toBe(false);
    }
  });

  it('refuses a lot whose road would be off the map', () => {
    // On the top row the north road is off the map.
    expect(lotAt(grid, 3, 'n')).toBeNull();
    // On the left column the west road is off the map.
    expect(lotAt(grid, 3 * grid.cols, 'w')).toBeNull();
  });

  it('refuses a lot that runs off the map', () => {
    const edge = 8 * grid.cols + 8;
    expect(lotAt(grid, edge, 's')).toBeNull();
    expect(lotAt(grid, edge, 'e')).toBeNull();
  });
});

describe('lotBlocker', () => {
  const fresh = () =>
    createSim({ seed: 1, grid: makeGrid(9, 9), roadBudget: 50 });

  it('allows a clear lot', () => {
    const sim = fresh();
    expect(lotBlocker(sim, at(sim.grid, 3, 3), 'n')).toBeNull();
  });

  it('refuses a lot that is off the map', () => {
    const sim = fresh();
    expect(lotBlocker(sim, at(sim.grid, 3, 0), 'n')).toBe('no-lot');
  });

  it('refuses a lot with water in it', () => {
    const sim = createSim({
      seed: 1,
      grid: makeGrid(9, 9, [[5, 4, Terrain.Water]]),
      roadBudget: 50,
    });
    expect(lotBlocker(sim, at(sim.grid, 3, 3), 'n')).toBe('unbuildable');
  });

  it('refuses a lot with a road on it', () => {
    const sim = fresh();
    drawRoads(sim, [at(sim.grid, 5, 4)]);
    expect(lotBlocker(sim, at(sim.grid, 3, 3), 'n')).toBe('road');
  });

  it('refuses a lot with a building on it', () => {
    const sim = fresh();
    placeBuilding(sim, {
      tile: at(sim.grid, 5, 4),
      kind: 'house',
      color: 0,
      entrance: 's',
    });
    expect(lotBlocker(sim, at(sim.grid, 3, 3), 'n')).toBe('occupied');
  });

  it('refuses a lot that overlaps a destination already placed', () => {
    const sim = fresh();
    sim.buildings.push({
      id: 0,
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 3, 3),
      entrance: 'n',
    });
    expect(lotBlocker(sim, at(sim.grid, 4, 2), 'n')).toBe('reserved');
  });

  it('allows a lot beside a destination that is already placed', () => {
    const sim = fresh();
    sim.buildings.push({
      id: 0,
      kind: 'destination',
      color: 0,
      tile: at(sim.grid, 3, 3),
      entrance: 'n',
    });
    expect(lotBlocker(sim, at(sim.grid, 3, 6), 'n')).toBeNull();
  });
});

describe('the driving lane and parking spaces', () => {
  it('has three spaces, each clear of the others', () => {
    expect(PARKING_SPACES).toHaveLength(3);
    // The spaces are diagonal, so compare the edges at each end of the slant: the far edge of one
    // space must stay short of the near edge of the next.
    const depthAt = (space: { a: number; d: number }[], a: number) =>
      space.filter((p) => p.a === a).map((p) => p.d);
    for (let i = 1; i < PARKING_SPACES.length; i++) {
      const prev = PARKING_SPACES[i - 1];
      const next = PARKING_SPACES[i];
      for (const a of [0.5, 1.5]) {
        const far = Math.max(...depthAt(prev, a));
        const near = Math.min(...depthAt(next, a));
        expect(near).toBeGreaterThan(far);
      }
    }
  });

  it('keeps every space between the entry and exit lanes, and off the far lane', () => {
    for (const space of PARKING_SPACES) {
      for (const p of space) {
        // The entry lane is at a = 0.25 and the exit lane at a = 1.75, each a quarter tile wide either side.
        expect(p.a).toBeGreaterThanOrEqual(0.5);
        expect(p.a).toBeLessThanOrEqual(1.5);
        // The return lane is at d = 0.25 and the far lane at d = 2.75, each an eighth of a tile either side.
        expect(p.d).toBeGreaterThan(0.25 + 0.125);
        expect(p.d).toBeLessThan(2.75 - 0.125);
      }
    }
  });

  it('starts and ends the lane at the access road node, for every side', () => {
    const grid = createGrid(9, 9);
    const origin = 3 * grid.cols + 3;
    for (const side of SIDES) {
      const layout = stripLayout(grid, origin, side);
      if (!layout) throw new Error(`no layout for ${side}`);
      const first = layout.lane[0];
      const last = layout.lane[layout.lane.length - 1];
      expect(first).toEqual(last);
      // The node sits one tile out from the lot's inlet, on the road side.
      const access = accessTile(grid, {
        id: -1,
        kind: 'destination',
        color: 0,
        tile: origin,
        entrance: side,
      });
      if (access === null) throw new Error('no access tile');
      expect(Math.floor(first.x)).toBe(access % grid.cols);
      expect(Math.floor(first.y)).toBe(Math.floor(access / grid.cols));
    }
  });

  it('keeps the spaces inside the lot footprint for every side', () => {
    const grid = createGrid(9, 9);
    const origin = 3 * grid.cols + 3;
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      const layout = stripLayout(grid, origin, side);
      if (!lot || !layout) throw new Error(`no lot for ${side}`);
      const xs = lot.tiles.map((t) => t % grid.cols);
      const ys = lot.tiles.map((t) => Math.floor(t / grid.cols));
      for (const space of layout.spaces) {
        for (const p of space) {
          expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs));
          expect(p.x).toBeLessThanOrEqual(Math.max(...xs) + 1);
          expect(p.y).toBeGreaterThanOrEqual(Math.min(...ys));
          expect(p.y).toBeLessThanOrEqual(Math.max(...ys) + 1);
        }
      }
    }
  });
});
