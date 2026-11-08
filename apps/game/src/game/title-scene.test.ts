import { step } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { BASE_PALETTE_IDS } from '@overpass-game/render-style';
import {
  backdropPalette,
  buildTitleScene,
  keepTitleBusy,
  loopPath,
} from './title-scene.ts';

describe('the start screen backdrop', () => {
  it('closes its loop: each tile touches the next, and the last touches the first', () => {
    const path = loopPath(2, 3, 14, 9);
    path.forEach(([x, y], i) => {
      const [nx, ny] = path[(i + 1) % path.length] ?? [x, y];
      expect(Math.max(Math.abs(nx - x), Math.abs(ny - y))).toBe(1);
    });
  });

  it('lays out one business and 1 to 5 houses, for many seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sim = buildTitleScene(seed);
      const businesses = sim.buildings.filter((b) => b.kind === 'destination');
      const houses = sim.buildings.filter((b) => b.kind === 'house');
      expect(businesses).toHaveLength(1);
      expect(houses.length).toBeGreaterThanOrEqual(1);
      expect(houses.length).toBeLessThanOrEqual(5);
    }
  });

  it('keeps cars making trips between the houses and the business, and never ends', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = buildTitleScene(seed);
      for (let t = 0; t < 4000; t++) {
        keepTitleBusy(sim);
        step(sim);
      }
      expect(sim.over).toBeNull();
      expect(sim.tripsCompleted).toBeGreaterThan(0);
    }
  }, 60_000);

  it('draws in one of the land families, and not always the same one', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const id = backdropPalette(seed * 7919);
      expect(BASE_PALETTE_IDS).toContain(id);
      seen.add(id);
    }
    expect(seen.size).toBe(BASE_PALETTE_IDS.length);
  });
});
