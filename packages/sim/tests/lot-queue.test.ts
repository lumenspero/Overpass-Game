import { describe, expect, it } from 'vitest';
import {
  createSim,
  OVERFLOW_PIN_LIMIT,
  placeBuilding,
  step,
  type Car,
  type SimState,
} from '../src/index.ts';
import { at, drawRoads, makeGrid } from './helpers.ts';

/** A 28-tile road, a busy business at its east end with all its pins up, and eight of its houses. */
function town(): { sim: SimState; dest: number } {
  const sim = createSim({
    seed: 7,
    grid: makeGrid(32, 14),
    roadBudget: 200,
    rules: [{ kind: 'noSpawns' }],
  });
  drawRoads(
    sim,
    Array.from({ length: 28 }, (_, i) => at(sim.grid, i + 1, 5)),
  );
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(sim.grid, 26, 6),
    entrance: 'n',
  });
  const dest = sim.buildings[sim.buildings.length - 1]!.id;
  for (let i = 0; i < 8; i++) {
    placeBuilding(sim, {
      kind: 'house',
      color: 0,
      tile: at(sim.grid, 2 + i * 2, 4),
      entrance: 's',
    });
  }
  const demand = sim.demand[dest]!;
  demand.pins = OVERFLOW_PIN_LIMIT;
  demand.growth = 16;
  return { sim, dest };
}

describe('queueing inside a lot', () => {
  it('queues cars in the lot when its spaces are full, and lets each one park', () => {
    const { sim, dest } = town();
    const queuedFor = new Map<Car, number>();
    let maxQueued = 0;
    let maxTurnedAway = 0;
    for (let t = 0; t < 2400; t++) {
      step(sim);
      const queued = sim.cars.filter((c) => c.lot?.phase === 'queued');
      maxQueued = Math.max(maxQueued, queued.length);
      for (const c of queued) queuedFor.set(c, (queuedFor.get(c) ?? 0) + 1);
      // A car turned away waits on the road at the lot's node, outside the lot.
      const turnedAway = sim.cars.filter(
        (c) =>
          c.lot === undefined &&
          c.state === 'driving' &&
          c.destination === dest &&
          c.progress >= c.route.length - 1,
      ).length;
      maxTurnedAway = Math.max(maxTurnedAway, turnedAway);
    }
    expect(maxQueued).toBeGreaterThan(0);
    // Each queued car turned in to a space within 20 seconds.
    expect(Math.max(...queuedFor.values())).toBeLessThan(600);
    expect(maxTurnedAway).toBeLessThanOrEqual(1);
  });
});
