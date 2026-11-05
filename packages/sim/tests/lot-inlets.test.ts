import { describe, expect, it } from 'vitest';
import {
  createSim,
  destinationLot,
  placeBuilding,
  placeRoads,
  type Building,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';
import { lotPath } from '../src/index.ts';

/** A destination facing south on an open grid, with its lot. */
function withDestination(): { sim: SimState; destination: Building } {
  const grid = makeGrid(20, 20);
  const sim = createSim({ seed: 1, grid, roadBudget: 200 });
  const tile = 5 * 20 + 10;
  placeBuilding(sim, { kind: 'destination', color: 0, tile, entrance: 's' });
  const destination = sim.buildings[0];
  return { sim, destination };
}

describe('lot inlets', () => {
  it('refuses a road on a tile inside the lot, so no new inlet can open', () => {
    const { sim, destination } = withDestination();
    const lot = destinationLot(sim.grid, destination);
    expect(lot).not.toBeNull();
    const inside = lot?.tiles[0] ?? -1;
    expect(placeRoads(sim, [inside])).toEqual({
      ok: false,
      reason: 'unbuildable',
    });
  });

  it('still accepts the road in front of the lot, the starting inlet', () => {
    const { sim, destination } = withDestination();
    const lot = destinationLot(sim.grid, destination);
    expect(placeRoads(sim, [lot?.road ?? -1])).toEqual({ ok: true, added: 1 });
  });
});

describe('lot crossing lanes', () => {
  it('enters and leaves through the inlet lanes, never on the road edges', () => {
    const grid = makeGrid(12, 12);
    const sim = createSim({ seed: 1, grid, roadBudget: 80 });
    placeBuilding(sim, {
      kind: 'destination',
      color: 0,
      tile: at(grid, 3, 3),
      entrance: 's',
    });
    const building = sim.buildings[0];
    if (!building) throw new Error('setup failed');
    // The inlet road runs down the centre of tile column 7, so its lanes are 0.125 either side of x = 7.5.
    const roadX = 7.5;
    const enter = lotPath(sim.grid, building, 0, 'in', 'near');
    const leave = lotPath(sim.grid, building, 0, 'out', 'near');
    if (!enter || !leave) throw new Error('no lot path');
    const crossIn = enter[1];
    const crossOut = leave[leave.length - 2];
    if (!crossIn || !crossOut) throw new Error('no crossing point');
    expect(Math.abs(crossIn.x - roadX)).toBeLessThanOrEqual(0.125 + 1e-9);
    expect(Math.abs(crossOut.x - roadX)).toBeLessThanOrEqual(0.125 + 1e-9);
  });
});
