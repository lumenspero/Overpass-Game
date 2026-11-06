import { describe, expect, it } from 'vitest';
import {
  createSim,
  lotAt,
  placeStartingPair,
  Terrain,
  tuning,
  type Building,
  type SimState,
} from '../src/index.ts';
import { makeGrid } from './helpers.ts';

const FENCE = { col: 5, row: 5, cols: 10, rows: 10 };

function open(seed: number): SimState {
  return createSim({
    seed,
    grid: makeGrid(20, 20),
    roadBudget: 10,
    startFence: FENCE,
  });
}

function houseAndDestination(sim: SimState): {
  house: Building;
  destination: Building;
} {
  const house = sim.buildings.find((b) => b.kind === 'house');
  const destination = sim.buildings.find((b) => b.kind === 'destination');
  if (!house || !destination) throw new Error('no starting pair');
  return { house, destination };
}

function inFence(tile: number, sim: SimState): boolean {
  const col = tile % sim.grid.cols;
  const row = Math.floor(tile / sim.grid.cols);
  return (
    col >= FENCE.col &&
    col < FENCE.col + FENCE.cols &&
    row >= FENCE.row &&
    row < FENCE.row + FENCE.rows
  );
}

describe('the starting pair', () => {
  it('places one house and one destination of the same colour inside the fence', () => {
    const sim = open(1);
    expect(placeStartingPair(sim)).toBe(true);
    expect(sim.buildings).toHaveLength(2);
    const { house, destination } = houseAndDestination(sim);
    expect(house.color).toBe(destination.color);
    expect(inFence(house.tile, sim)).toBe(true);
    expect(inFence(destination.tile, sim)).toBe(true);
  });

  it('keeps the destination a few tiles from the house', () => {
    const sim = open(2);
    placeStartingPair(sim);
    const { house, destination } = houseAndDestination(sim);
    const dc = Math.abs((house.tile % 20) - (destination.tile % 20));
    const dr = Math.abs(
      Math.floor(house.tile / 20) - Math.floor(destination.tile / 20),
    );
    const d = Math.max(dc, dr);
    expect(d).toBeGreaterThanOrEqual(tuning.START_PAIR_MIN_TILES);
    expect(d).toBeLessThanOrEqual(tuning.START_PAIR_MAX_TILES);
  });

  it('keeps the whole destination lot inside the fence, even at the fence edge', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sim = createSim({
        seed,
        grid: makeGrid(20, 20),
        roadBudget: 10,
        startFence: { col: 0, row: 0, cols: 9, rows: 9 },
      });
      if (!placeStartingPair(sim)) continue;
      const { destination } = houseAndDestination(sim);
      const lot = lotAt(
        sim.grid,
        destination.tile,
        destination.entrance,
        'single',
        'near',
      );
      expect(lot).not.toBeNull();
      for (const t of [...(lot?.tiles ?? []), lot?.road ?? -1]) {
        const col = t % 20;
        const row = Math.floor(t / 20);
        expect(
          col < 9 && row < 9,
          `seed ${seed}: tile ${t} outside the fence`,
        ).toBe(true);
      }
    }
  });

  it('is repeatable for the same seed', () => {
    const a = open(7);
    const b = open(7);
    placeStartingPair(a);
    placeStartingPair(b);
    expect(a.buildings.map((x) => [x.kind, x.tile, x.entrance])).toEqual(
      b.buildings.map((x) => [x.kind, x.tile, x.entrance]),
    );
  });

  it('puts the destination within START_PAIR_MAX_TILES of the house', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sim = createSim({
        seed,
        grid: makeGrid(20, 20),
        roadBudget: 10,
        startFence: { col: 2, row: 2, cols: 16, rows: 16 },
      });
      if (!placeStartingPair(sim)) continue;
      const { house, destination } = houseAndDestination(sim);
      const d = Math.max(
        Math.abs((house.tile % 20) - (destination.tile % 20)),
        Math.abs(
          Math.floor(house.tile / 20) - Math.floor(destination.tile / 20),
        ),
      );
      expect(d).toBeGreaterThanOrEqual(tuning.START_PAIR_MIN_TILES);
      expect(d).toBeLessThanOrEqual(tuning.START_PAIR_MAX_TILES);
    }
  });

  it('fails cleanly when no tile in the fence can hold a house', () => {
    const grid = makeGrid(4, 4);
    grid.terrain.fill(Terrain.Water); // no tile can hold a building
    const sim = createSim({
      seed: 1,
      grid,
      roadBudget: 10,
      startFence: { col: 0, row: 0, cols: 4, rows: 4 },
    });
    expect(placeStartingPair(sim)).toBe(false);
    expect(sim.buildings).toHaveLength(0);
  });
});
