import {
  createGrid,
  createSim,
  isHouseStub,
  linkPartners,
  placeBuilding,
  type SimState,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { applyIntent, createController } from './controller.ts';

const COLS = 8;
const idx = (x: number, y: number) => y * COLS + x;
const identity = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });

/** A house at (3,3) facing south, so its stub starts at (3,4). */
function withHouse(): { sim: SimState; house: number } {
  const sim = createSim({
    seed: 1,
    grid: createGrid(COLS, COLS),
    roadBudget: 20,
  });
  const r = placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: idx(3, 3),
    entrance: 's',
  });
  if (!r.ok) throw new Error('setup failed');
  return { sim, house: r.id };
}

/** Presses at `from`, drags through each point, then releases or cancels. */
function stroke(
  sim: SimState,
  mode: 'draw' | 'erase',
  from: { x: number; y: number },
  points: Array<{ x: number; y: number }>,
  cancel = false,
): void {
  const ctl = createController(sim);
  applyIntent(ctl, { type: 'stroke-begin', mode, at: from }, identity);
  for (const p of points) {
    applyIntent(ctl, { type: 'stroke-move', at: p }, identity);
  }
  applyIntent(
    ctl,
    cancel ? { type: 'stroke-cancel' } : { type: 'stroke-end' },
    identity,
  );
}

describe('house stubs in the controller', () => {
  it('a drag from a house to a corner moves its stub there and draws on from it', () => {
    const { sim, house } = withHouse();
    stroke(sim, 'draw', { x: 3.5, y: 3.5 }, [
      { x: 4.5, y: 2.5 },
      { x: 5.5, y: 2.5 },
    ]);
    expect(sim.buildings[house]?.stub).toBe(idx(4, 2));
    expect(sim.roads[idx(3, 4)]).toBe(0);
    expect(sim.roads[idx(5, 2)]).toBe(1);
    expect(linkPartners(sim.links, idx(4, 2))).toEqual([idx(5, 2)]);
    // Only the new road tile was paid for; the stub and its move are free.
    expect(sim.budget).toBe(19);
  });

  it('an erase stroke leaves the stub in place', () => {
    const { sim } = withHouse();
    stroke(sim, 'draw', { x: 3.5, y: 4.5 }, [{ x: 4.5, y: 4.5 }]);
    stroke(sim, 'erase', { x: 4.5, y: 4.5 }, [{ x: 3.5, y: 4.5 }]);
    expect(sim.roads[idx(4, 4)]).toBe(0);
    expect(sim.roads[idx(3, 4)]).toBe(1);
    expect(isHouseStub(sim, idx(3, 4))).toBe(true);
  });

  it('a cancelled drag puts the stub back with its links', () => {
    const { sim, house } = withHouse();
    stroke(sim, 'draw', { x: 3.5, y: 4.5 }, [{ x: 2.5, y: 4.5 }]);
    stroke(sim, 'draw', { x: 3.5, y: 3.5 }, [{ x: 4.5, y: 3.5 }], true);
    expect(sim.buildings[house]?.stub).toBe(idx(3, 4));
    expect(sim.roads[idx(4, 3)]).toBe(0);
    expect(linkPartners(sim.links, idx(3, 4))).toEqual([idx(2, 4)]);
  });

  it('erasing over a stub cuts its links but leaves the stub and the road', () => {
    const { sim } = withHouse();
    // A road through the stub at (3,4), from (2,4) to (4,4).
    stroke(sim, 'draw', { x: 2.5, y: 4.5 }, [
      { x: 3.5, y: 4.5 },
      { x: 4.5, y: 4.5 },
    ]);
    expect(linkPartners(sim.links, idx(3, 4)).length).toBe(2);
    const budget = sim.budget;
    stroke(sim, 'erase', { x: 3.5, y: 4.5 }, []);
    expect(sim.roads[idx(3, 4)]).toBe(1);
    expect(isHouseStub(sim, idx(3, 4))).toBe(true);
    expect(linkPartners(sim.links, idx(3, 4))).toEqual([]);
    expect(sim.roads[idx(2, 4)]).toBe(1);
    expect(sim.roads[idx(4, 4)]).toBe(1);
    // No tile was removed, so nothing is refunded.
    expect(sim.budget).toBe(budget);
  });

  it('a cancelled erase over a stub puts its links back', () => {
    const { sim } = withHouse();
    stroke(sim, 'draw', { x: 2.5, y: 4.5 }, [{ x: 3.5, y: 4.5 }]);
    stroke(sim, 'erase', { x: 3.5, y: 4.5 }, [], true);
    expect(linkPartners(sim.links, idx(3, 4))).toEqual([idx(2, 4)]);
  });

  it('cutting a taken-over road from its stub, then moving the stub, leaves no road behind', () => {
    const { sim, house } = withHouse();
    // A paid road at (4,4) and (5,4); the stub then moves onto (4,4) and takes it over.
    stroke(sim, 'draw', { x: 4.5, y: 4.5 }, [{ x: 5.5, y: 4.5 }]);
    stroke(sim, 'draw', { x: 3.5, y: 3.5 }, [{ x: 4.5, y: 4.5 }]);
    expect(sim.buildings[house]?.stub).toBe(idx(4, 4));
    // Erase over the stub cuts it off, then the stub moves to (2,4).
    stroke(sim, 'erase', { x: 4.5, y: 4.5 }, []);
    stroke(sim, 'draw', { x: 3.5, y: 3.5 }, [{ x: 2.5, y: 4.5 }]);
    expect(sim.buildings[house]?.stub).toBe(idx(2, 4));
    expect(sim.roads[idx(4, 4)]).toBe(0);
    expect(sim.roads[idx(5, 4)]).toBe(1);
    // Two tiles were paid for; the one left behind was refunded.
    expect(sim.budget).toBe(19);
  });

  it('a cancelled move off a refunded road buys it back and takes it over again', () => {
    const { sim, house } = withHouse();
    stroke(sim, 'draw', { x: 4.5, y: 4.5 }, []);
    stroke(sim, 'draw', { x: 3.5, y: 3.5 }, [{ x: 4.5, y: 4.5 }]);
    expect(sim.budget).toBe(19);
    stroke(sim, 'draw', { x: 3.5, y: 3.5 }, [{ x: 2.5, y: 4.5 }], true);
    expect(sim.buildings[house]?.stub).toBe(idx(4, 4));
    expect(sim.buildings[house]?.stubAdopted).toBe(true);
    expect(sim.roads[idx(2, 4)]).toBe(0);
    expect(sim.budget).toBe(19);
  });
});
