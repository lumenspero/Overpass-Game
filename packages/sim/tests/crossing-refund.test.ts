import { afterEach, describe, expect, it } from 'vitest';
import {
  type CrossingTileRecord,
  createSim,
  placeCrossing,
  releaseCrossingTile,
  removeRoads,
  resetTuning,
  restoreCrossingTile,
  type SimState,
  Terrain,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

afterEach(() => resetTuning());

/** A bridge over three water tiles on row 1, with land at both ends. Stock goes 1 to 0. */
function bridged(): { sim: SimState; tiles: number[] } {
  const sim = createSim({
    seed: 1,
    grid: makeGrid(8, 3, [
      [2, 1, Terrain.Water],
      [3, 1, Terrain.Water],
      [4, 1, Terrain.Water],
    ]),
    roadBudget: 20,
  });
  sim.stock.bridge = 1;
  const tiles = [1, 2, 3, 4, 5].map((x) => at(sim.grid, x, 1));
  expect(placeCrossing(sim, 'bridge', tiles).ok).toBe(true);
  expect(sim.stock.bridge).toBe(0);
  return { sim, tiles };
}

/** Erases one tile the way the controller does, returning what an undo needs. */
function erase(sim: SimState, i: number): CrossingTileRecord | null {
  const record = releaseCrossingTile(sim, i);
  removeRoads(sim, [i]);
  return record;
}

describe('erasing a bridge', () => {
  it('returns its stock when the last of its tiles is erased', () => {
    const { sim, tiles } = bridged();
    erase(sim, tiles[1]);
    erase(sim, tiles[2]);
    expect(sim.stock.bridge).toBe(0);
    erase(sim, tiles[3]);
    expect(sim.stock.bridge).toBe(1);
  });

  it('returns the stock once, even when the bridge is split first', () => {
    const { sim, tiles } = bridged();
    erase(sim, tiles[2]);
    erase(sim, tiles[1]);
    erase(sim, tiles[3]);
    expect(sim.stock.bridge).toBe(1);
  });

  it('takes the stock back when an erase is undone after the run went', () => {
    const { sim, tiles } = bridged();
    const records = [tiles[1], tiles[2], tiles[3]].map(
      (i) => [i, erase(sim, i) as CrossingTileRecord] as const,
    );
    expect(sim.stock.bridge).toBe(1);
    for (const [i, record] of [...records].reverse()) {
      restoreCrossingTile(sim, i, record);
    }
    expect(sim.stock.bridge).toBe(0);
    const runs = Object.values(sim.crossingRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0].tiles).toBe(3);
  });

  it('leaves the stock alone when a plain road is erased', () => {
    const { sim, tiles } = bridged();
    erase(sim, tiles[0]);
    expect(sim.stock.bridge).toBe(0);
  });
});
