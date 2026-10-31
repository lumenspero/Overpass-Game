import {
  createGrid,
  createSim,
  linkTiles,
  placeRoads,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { applyIntent, createController } from './controller.ts';

const COLS = 7;
const idx = (x: number, y: number) => y * COLS + x;
const identity = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });

/** A plus-shaped junction centred on tile (3, 3). */
function junction() {
  const sim = createSim({ seed: 1, grid: createGrid(COLS, 7), roadBudget: 80 });
  const centre = idx(3, 3);
  const arms = [idx(2, 3), idx(4, 3), idx(3, 2), idx(3, 4)];
  placeRoads(sim, [centre, ...arms]);
  for (const arm of arms) linkTiles(sim, centre, arm);
  return { sim, centre };
}

describe('pressing a roundabout or light tool on a junction', () => {
  it('places a light on the pressed junction and reports it', () => {
    const { sim, centre } = junction();
    sim.stock.light = 1;
    const ctl = createController(sim);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'light', at: { x: 3.5, y: 3.5 } },
      identity,
    );
    expect(sim.controls[centre]).toBe('light');
    expect(sim.stock.light).toBe(0);
    expect(ctl.crossing?.kind).toBe('control');
  });

  it('places a roundabout on a plain road tile', () => {
    const { sim } = junction();
    sim.stock.roundabout = 1;
    const ctl = createController(sim);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'roundabout', at: { x: 2.5, y: 2.5 } },
      identity,
    );
    expect(sim.controls[idx(2, 2)]).toBe('roundabout');
    expect(ctl.crossing?.kind).toBe('control');
  });
});
