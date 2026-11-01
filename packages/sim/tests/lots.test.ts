import { describe, expect, it } from 'vitest';
import type { Side } from '../src/buildings.ts';
import { createGrid, type Grid } from '../src/grid.ts';
import { LOT_ACROSS, LOT_DEPTH, lotAt } from '../src/lots.ts';

const SIDES: Side[] = ['n', 'e', 's', 'w'];

/** Whether two tiles touch along an edge. */
function touches(grid: Grid, a: number, b: number): boolean {
  const dx = Math.abs((a % grid.cols) - (b % grid.cols));
  const dy = Math.abs(Math.floor(a / grid.cols) - Math.floor(b / grid.cols));
  return dx + dy === 1;
}

/** A 9×9 map, with the lot's top-left at the centre so every side has room. */
const grid = createGrid(9, 9);
const origin = 3 * grid.cols + 3;

describe('lotAt', () => {
  it('is a 3×2 lot (or 2×3 when the road is east or west) with a 2×2 building', () => {
    expect(LOT_ACROSS).toBe(3);
    expect(LOT_DEPTH).toBe(2);
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      expect(lot).not.toBeNull();
      if (!lot) continue;
      expect(lot.tiles).toHaveLength(6);
      expect(new Set(lot.tiles).size).toBe(6);
      expect(lot.footprint).toHaveLength(4);
    }
  });

  it('keeps the building inside the lot, and the open strip outside the building', () => {
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      if (!lot) throw new Error(`no lot for ${side}`);
      for (const t of lot.footprint) expect(lot.tiles).toContain(t);
      const open = lot.tiles.filter((t) => !lot.footprint.includes(t));
      expect(open).toHaveLength(2);
      expect(open).toContain(lot.inlet);
      expect(open).toContain(lot.stop);
    }
  });

  it('puts the inlet on the road side of the lot, touching the road', () => {
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      if (!lot) throw new Error(`no lot for ${side}`);
      expect(lot.tiles).toContain(lot.inlet);
      expect(lot.tiles).not.toContain(lot.road);
      expect(touches(grid, lot.inlet, lot.road)).toBe(true);
    }
  });

  it('puts the stop beside the building, not on the road', () => {
    for (const side of SIDES) {
      const lot = lotAt(grid, origin, side);
      if (!lot) throw new Error(`no lot for ${side}`);
      expect(lot.footprint.some((f) => touches(grid, f, lot.stop))).toBe(true);
      expect(lot.stop).not.toBe(lot.inlet);
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
