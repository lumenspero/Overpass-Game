import { describe, expect, it } from 'vitest';
import {
  createSim,
  destinationLot,
  placeBuilding,
  placeMotorway,
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

describe('lot crossing on the right lane', () => {
  it('enters and leaves every inlet of a double lot in the right-hand lane, on every side', () => {
    for (const side of ['e', 's', 'w', 'n'] as const) {
      const grid = makeGrid(14, 14);
      const sim = createSim({ seed: 1, grid, roadBudget: 80 });
      placeBuilding(sim, {
        kind: 'destination',
        color: 0,
        tile: at(grid, 6, 6),
        entrance: side,
        lot: 'double',
      });
      const building = sim.buildings[0];
      const lot = building ? destinationLot(sim.grid, building) : null;
      if (!building || !lot) throw new Error('setup failed');
      for (const inlet of ['near', 'far'] as const) {
        const roadTile = inlet === 'near' ? lot.road : lot.farRoad;
        const inletTile = inlet === 'near' ? lot.inlet : lot.farInlet;
        if (roadTile === undefined || inletTile === undefined) continue;
        const cols = grid.cols;
        const road = {
          x: (roadTile % cols) + 0.5,
          y: Math.floor(roadTile / cols) + 0.5,
        };
        const into = {
          x: (inletTile % cols) + 0.5,
          y: Math.floor(inletTile / cols) + 0.5,
        };
        // Entering travel runs from the road into the lot; the right-hand lane is 90° clockwise of it on screen.
        const dx = Math.sign(into.x - road.x);
        const dy = Math.sign(into.y - road.y);
        const right = { x: -dy, y: dx };
        const enter = lotPath(sim.grid, building, 0, 'in', inlet);
        const leave = lotPath(sim.grid, building, 0, 'out', inlet);
        if (!enter || !leave) throw new Error('no lot path');
        const crossIn = enter[1];
        const crossOut = leave[leave.length - 2];
        if (!crossIn || !crossOut) throw new Error('no crossing point');
        const sideOf = (
          p: { x: number; y: number },
          n: { x: number; y: number },
        ) => (p.x - road.x) * n.x + (p.y - road.y) * n.y;
        expect(sideOf(crossIn, right)).toBeCloseTo(0.125, 6);
        expect(sideOf(crossOut, { x: -right.x, y: -right.y })).toBeCloseTo(
          0.125,
          6,
        );
      }
    }
  });
});

describe('motorway ends at a lot inlet', () => {
  /** A destination with one motorway in stock and a road tile well to its south. */
  function setUp() {
    const { sim, destination } = withDestination();
    sim.stock.motorway = 1;
    const far = 16 * 20 + 10;
    expect(placeRoads(sim, [far]).ok).toBe(true);
    const lot = destinationLot(sim.grid, destination);
    if (!lot) throw new Error('no lot');
    return { sim, far, inlet: lot.road };
  }
  const centre = (i: number) => ({
    x: (i % 20) + 0.5,
    y: Math.floor(i / 20) + 0.5,
  });

  it('ends on an unbuilt inlet, laying that tile as road and charging it', () => {
    const { sim, far, inlet } = setUp();
    expect(sim.roads[inlet]).toBe(0);
    const before = sim.budget;
    const result = placeMotorway(sim, far, inlet, [centre(far), centre(inlet)]);
    expect(result.ok).toBe(true);
    expect(sim.roads[inlet]).toBe(1);
    if (result.ok) expect(sim.budget).toBe(before - result.cost - 1);
  });

  it('still refuses an end on plain unbuilt ground', () => {
    const { sim, far } = setUp();
    const plain = 16 * 20 + 3;
    const result = placeMotorway(sim, far, plain, [centre(far), centre(plain)]);
    expect(result).toEqual({ ok: false, reason: 'bad-endpoint' });
    expect(sim.roads[plain]).toBe(0);
  });
});
