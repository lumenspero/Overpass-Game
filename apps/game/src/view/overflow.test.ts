import { TILE_SIZE } from '@overpass-game/render-style';
import {
  type Building,
  type Demand,
  createGrid,
  OVERFLOW_TICKS,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { overflowRings } from './overflow.ts';

const grid = createGrid(4, 4);
const house: Building = {
  id: 0,
  kind: 'house',
  color: 0,
  tile: 0,
  entrance: 'e',
};
const dest: Building = {
  id: 1,
  kind: 'destination',
  color: 0,
  tile: 5,
  entrance: 'w',
};

describe('overflowRings', () => {
  it('draws a full ring round an overflowing destination', () => {
    const demand: Record<number, Demand> = {
      1: {
        pins: 9,
        cooldown: 0,
        overflow: OVERFLOW_TICKS,
        growth: 0,
      },
    };
    const rings = overflowRings([house, dest], demand, grid);
    expect(rings).toHaveLength(1);
    expect(rings[0].fraction).toBe(1);
    expect(rings[0].x).toBeCloseTo(1.5 * TILE_SIZE); // tile 5 is column 1, row 1
    expect(rings[0].y).toBeCloseTo(1.5 * TILE_SIZE);
  });

  it('empties as the countdown runs down', () => {
    const demand: Record<number, Demand> = {
      1: {
        pins: 9,
        cooldown: 0,
        overflow: OVERFLOW_TICKS / 2,
        growth: 0,
      },
    };
    expect(overflowRings([dest], demand, grid)[0].fraction).toBeCloseTo(0.5);
  });

  it('draws nothing for a destination that is not overflowing', () => {
    const demand: Record<number, Demand> = {
      1: { pins: 2, cooldown: 0, overflow: 0, growth: 0 },
    };
    expect(overflowRings([dest], demand, grid)).toEqual([]);
  });

  it('never draws a ring round a house', () => {
    const demand: Record<number, Demand> = {
      0: {
        pins: 9,
        cooldown: 0,
        overflow: OVERFLOW_TICKS,
        growth: 0,
      },
    };
    expect(overflowRings([house], demand, grid)).toEqual([]);
  });
});
