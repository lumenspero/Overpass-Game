import { TILE_SIZE } from '@overpass-game/render-style';
import {
  type Car,
  createGrid,
  createSim,
  linkTiles,
  placeBuilding,
  placeControl,
  placeRoads,
  step,
  type SimState,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { carShapes } from './geometry.ts';

/**
 * As in play: a roundabout right next to a lot's access tile. The house at (1,3) feeds a road east to the
 * roundabout at (5,3); the access tile (5,4) lies straight below it, and the lot's inlet (5,5) below that.
 */
function town(): { sim: SimState; access: number } {
  const sim = createSim({ seed: 1, grid: createGrid(12, 12), roadBudget: 100 });
  const at = (x: number, y: number) => y * 12 + x;
  placeBuilding(sim, {
    kind: 'house',
    color: 0,
    tile: at(1, 3),
    entrance: 'e',
  });
  placeBuilding(sim, {
    kind: 'destination',
    color: 0,
    tile: at(5, 5),
    entrance: 'n',
  });
  const road = [at(2, 3), at(3, 3), at(4, 3), at(5, 3), at(5, 4)];
  placeRoads(sim, road);
  for (let i = 1; i < road.length; i++)
    linkTiles(sim, road[i - 1] ?? 0, road[i] ?? 0);
  sim.stock.roundabout = 1;
  const ring = placeControl(sim, at(5, 3), 'roundabout');
  if (!ring.ok) throw new Error(`roundabout refused: ${ring.reason}`);
  return { sim, access: at(5, 4) };
}

describe('a car between a roundabout and a lot next to it', () => {
  it('moves on smoothly, without hopping back or stalling, both into the lot and out of it', () => {
    const { sim, access } = town();
    const ac = {
      x: ((access % 12) + 0.5) * TILE_SIZE,
      y: (Math.floor(access / 12) + 0.5) * TILE_SIZE,
    };
    sim.demand[1].pins = 1;
    let id: number | null = null;
    let prev: { x: number; y: number } | null = null;
    // Steps near the access tile, in tiles, for each leg (in, then out); a new leg starts once it parks.
    const legs: { x: number; y: number }[][] = [[], []];
    let leg = 0;
    for (let t = 0; t < 4000; t++) {
      step(sim);
      const car: Car | undefined =
        id === null ? sim.cars[0] : sim.cars.find((c) => c.id === id);
      if (!car) {
        if (id !== null) break; // home
        continue;
      }
      id = car.id;
      if (car.lot?.phase === 'parked') {
        leg = 1;
        prev = null;
        continue;
      }
      const [dot] = carShapes(
        [car],
        sim.buildings,
        sim.grid,
        [0],
        sim.motorways,
        sim.controls,
        sim.links,
      );
      if (!dot) continue;
      const near = Math.hypot(dot.x - ac.x, dot.y - ac.y) / TILE_SIZE < 1.4;
      if (prev && near) {
        legs[leg]?.push({
          x: (dot.x - prev.x) / TILE_SIZE,
          y: (dot.y - prev.y) / TILE_SIZE,
        });
      }
      prev = { x: dot.x, y: dot.y };
    }
    for (const steps of legs) {
      expect(steps.length).toBeGreaterThan(10);
      const sizes = steps
        .map((v) => Math.hypot(v.x, v.y))
        .filter((s) => s > 1e-6);
      const sorted = [...sizes].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      // No jump: no step much longer than the car's usual step.
      expect(Math.max(...sizes)).toBeLessThan(2.5 * median);
      // No hop back: each step heads broadly the same way as the one before.
      for (let i = 1; i < steps.length; i++) {
        const a = steps[i - 1];
        const b = steps[i];
        if (!a || !b) continue;
        const la = Math.hypot(a.x, a.y);
        const lb = Math.hypot(b.x, b.y);
        if (la < 1e-6 || lb < 1e-6) continue;
        expect((a.x * b.x + a.y * b.y) / (la * lb)).toBeGreaterThan(0.5);
      }
      // No stall: once moving, the car does not stand still between moving steps.
      const all = steps.map((v) => Math.hypot(v.x, v.y));
      const first = all.findIndex((s) => s > 1e-6);
      const last =
        all.length - 1 - [...all].reverse().findIndex((s) => s > 1e-6);
      for (let i = first; i <= last; i++)
        expect(all[i]).toBeGreaterThan(0.3 * median);
    }
  });
});
