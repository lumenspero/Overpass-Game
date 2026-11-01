import {
  entranceTile,
  findRoute,
  roadLinks,
  type SimState,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { buildDemo, DEMOS, type DemoId } from './demos.ts';

const COLS = 16;
const at = (x: number, y: number) => y * COLS + x;

/** The road tiles in front of the first house and the first destination. */
function ends(sim: SimState): { house: number; dest: number } {
  const house = sim.buildings.find((b) => b.kind === 'house');
  const dest = sim.buildings.find((b) => b.kind === 'destination');
  if (!house || !dest) throw new Error('demo has no house or destination');
  return {
    house: entranceTile(sim.grid, house.tile, house.entrance) ?? -1,
    dest: entranceTile(sim.grid, dest.tile, dest.entrance) ?? -1,
  };
}

function connected(sim: SimState): boolean {
  const { house, dest } = ends(sim);
  return (
    findRoute(sim.grid, sim.roads, sim.links, house, dest, sim.motorways) !==
    null
  );
}

describe('the scripted demos', () => {
  it('each starts with one of the upgrade it demonstrates', () => {
    for (const demo of DEMOS) {
      expect(buildDemo(demo.id).stock[demo.id]).toBe(1);
    }
  });

  it('the bridge, tunnel and motorway demos cannot connect without their upgrade', () => {
    for (const id of ['bridge', 'tunnel', 'motorway'] as DemoId[]) {
      expect(connected(buildDemo(id))).toBe(false);
    }
  });

  it('the roundabout and light demos have a crossing with four arms', () => {
    for (const id of ['roundabout', 'light'] as DemoId[]) {
      const sim = buildDemo(id);
      expect(connected(sim)).toBe(true);
      expect(roadLinks(sim.roads, sim.links, at(7, 6)).length).toBe(4);
    }
  });
});
