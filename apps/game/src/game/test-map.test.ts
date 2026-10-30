import { createSim, placeBuilding } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { buildTestGrid, TEST_BUILDINGS } from './test-map.ts';

describe('test map', () => {
  it('accepts every test building', () => {
    const sim = createSim({ seed: 1, grid: buildTestGrid() });
    for (const b of TEST_BUILDINGS) {
      const result = placeBuilding(sim, {
        kind: b.kind,
        color: b.color,
        tile: b.row * sim.grid.cols + b.col,
        entrance: b.entrance,
      });
      expect(result.ok, JSON.stringify(b)).toBe(true);
    }
    expect(sim.buildings).toHaveLength(TEST_BUILDINGS.length);
  });
});
