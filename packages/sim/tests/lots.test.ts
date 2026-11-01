import { describe, expect, it } from 'vitest';
import type { Side } from '../src/buildings.ts';
import { createGrid, type Grid } from '../src/grid.ts';
import {
  BUILDING_SIZE,
  LOT_DEPTH,
  LOT_LENGTH,
  lotAt,
  STRIP_LENGTH,
} from '../src/lots.ts';

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
