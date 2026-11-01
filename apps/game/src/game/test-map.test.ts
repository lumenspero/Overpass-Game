import {
  accessTile,
  createSim,
  entranceTile,
  isBuildable,
  placeBuilding,
  type Grid,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import {
  buildTestDistricts,
  buildTestGrid,
  TEST_BUILDINGS,
  type TestBuilding,
} from './test-map.ts';

const tileOf = (grid: Grid, b: TestBuilding) => b.row * grid.cols + b.col;

/** True when `from` can reach `to` over buildable land, the way a road could. */
function landConnects(grid: Grid, from: number, to: number): boolean {
  const seen = new Set<number>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const t = queue.shift() as number;
    if (t === to) return true;
    const x = t % grid.cols;
    const y = Math.floor(t / grid.cols);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
        const n = ny * grid.cols + nx;
        if (seen.has(n) || !isBuildable(grid, n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}

describe('test map', () => {
  it('accepts every test building', () => {
    const sim = createSim({ seed: 1, grid: buildTestGrid() });
    for (const b of TEST_BUILDINGS) {
      const result = placeBuilding(sim, {
        kind: b.kind,
        color: b.color,
        tile: tileOf(sim.grid, b),
        entrance: b.entrance,
      });
      expect(result.ok, JSON.stringify(b)).toBe(true);
    }
    expect(sim.buildings).toHaveLength(TEST_BUILDINGS.length);
  });

  it('gives every colour a house and a destination that can connect by land', () => {
    const grid = buildTestGrid();
    const colors = new Set(TEST_BUILDINGS.map((b) => b.color));
    for (const color of colors) {
      const house = TEST_BUILDINGS.find(
        (b) => b.color === color && b.kind === 'house',
      );
      const dest = TEST_BUILDINGS.find(
        (b) => b.color === color && b.kind === 'destination',
      );
      expect(house, `house of colour ${color}`).toBeDefined();
      expect(dest, `destination of colour ${color}`).toBeDefined();
      if (!house || !dest) continue;
      const start = entranceTile(grid, tileOf(grid, house), house.entrance);
      // A destination connects through the road outside its lot's inlet.
      const end = accessTile(grid, {
        id: -1,
        kind: dest.kind,
        color: dest.color,
        tile: tileOf(grid, dest),
        entrance: dest.entrance,
      });
      expect(start !== null && end !== null, `entrances of ${color}`).toBe(
        true,
      );
      if (start === null || end === null) continue;
      expect(landConnects(grid, start, end), `colour ${color} connects`).toBe(
        true,
      );
    }
  });

  it('puts every building on a district the schedule can open', () => {
    const grid = buildTestGrid();
    const districts = buildTestDistricts();
    for (const b of TEST_BUILDINGS) {
      expect(districts[tileOf(grid, b)]).toBeLessThan(3);
    }
  });
});
