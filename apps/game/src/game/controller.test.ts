import {
  createGrid,
  createSim,
  findRoute,
  hasLink,
  linkPartners,
  linkTiles,
  placeRoads,
  type SimState,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { applyIntent, createController } from './controller.ts';

const COLS = 8;
const idx = (x: number, y: number) => y * COLS + x;
const identity = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });

function world(): SimState {
  return createSim({ seed: 1, grid: createGrid(COLS, COLS), roadBudget: 100 });
}

/** Presses at `from` and drags through each point in turn, as a mouse would. */
function drag(
  sim: SimState,
  mode: 'draw' | 'erase',
  from: { x: number; y: number },
  points: Array<{ x: number; y: number }>,
): void {
  const ctl = createController(sim);
  applyIntent(ctl, { type: 'stroke-begin', mode, at: from }, identity);
  for (const p of points) {
    applyIntent(ctl, { type: 'stroke-move', at: p }, identity);
  }
  applyIntent(ctl, { type: 'stroke-end' }, identity);
}

describe('drawing a path', () => {
  it('a branch dragged off a straight road joins only the tile it starts from', () => {
    const sim = world();
    drag(
      sim,
      'draw',
      { x: 0.5, y: 4.5 },
      [1.5, 2.5, 3.5, 4.5].map((x) => ({ x, y: 4.5 })),
    );
    drag(sim, 'draw', { x: 2.5, y: 4.5 }, [
      { x: 2.5, y: 3.5 },
      { x: 2.5, y: 2.5 },
    ]);
    expect(sim.roads[idx(2, 2)]).toBe(1);
    // The new tiles link only along the branch: nothing reaches across to the straight road.
    expect(linkPartners(sim.links, idx(2, 3)).sort((a, b) => a - b)).toEqual(
      [idx(2, 2), idx(2, 4)].sort((a, b) => a - b),
    );
    expect(linkPartners(sim.links, idx(2, 2))).toEqual([idx(2, 3)]);
    expect(
      findRoute(sim.grid, sim.roads, sim.links, idx(2, 2), idx(1, 4)),
    ).toEqual([idx(2, 2), idx(2, 3), idx(2, 4), idx(1, 4)]);
  });

  it('an extension dragged straight down keeps the diagonal beside a bend', () => {
    const sim = world();
    // Vertical road down x=4, drawn in one drag, then the diagonal drawn off its bend at (4,4).
    drag(
      sim,
      'draw',
      { x: 4.5, y: 0.5 },
      [1.5, 2.5, 3.5, 4.5].map((y) => ({ x: 4.5, y })),
    );
    drag(sim, 'draw', { x: 4.5, y: 4.5 }, [
      { x: 3.5, y: 5.5 },
      { x: 2.5, y: 6.5 },
    ]);
    expect(hasLink(sim.links, idx(4, 4), idx(3, 5))).toBe(true);

    // Now drag straight down from the vertical part, past the bend.
    drag(
      sim,
      'draw',
      { x: 4.5, y: 2.5 },
      [3.5, 4.5, 5.5, 6.5].map((y) => ({ x: 4.5, y })),
    );
    expect(sim.roads[idx(4, 5)]).toBe(1);
    expect(sim.roads[idx(4, 6)]).toBe(1);
    // The extension links only along its own drag: it does not snap to the diagonal's tile beside it.
    expect(hasLink(sim.links, idx(4, 5), idx(3, 5))).toBe(false);
    // The diagonal still starts at the bend, and still reaches its far end.
    expect(hasLink(sim.links, idx(4, 4), idx(3, 5))).toBe(true);
    expect(
      findRoute(sim.grid, sim.roads, sim.links, idx(4, 4), idx(2, 6)),
    ).not.toBeNull();
  });

  it('a diagonal drag links each diagonal step it draws', () => {
    const sim = world();
    drag(sim, 'draw', { x: 0.5, y: 0.5 }, [
      { x: 1.5, y: 1.5 },
      { x: 2.5, y: 2.5 },
    ]);
    expect(hasLink(sim.links, idx(0, 0), idx(1, 1))).toBe(true);
    expect(hasLink(sim.links, idx(1, 1), idx(2, 2))).toBe(true);
  });
});

describe('cancelling and erasing', () => {
  it('cancelling a stroke removes the roads and links it drew', () => {
    const sim = world();
    const ctl = createController(sim);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'draw', at: { x: 0.5, y: 0.5 } },
      identity,
    );
    applyIntent(ctl, { type: 'stroke-move', at: { x: 1.5, y: 1.5 } }, identity);
    applyIntent(ctl, { type: 'stroke-cancel' }, identity);
    expect(sim.roads[idx(0, 0)]).toBe(0);
    expect(sim.roads[idx(1, 1)]).toBe(0);
    expect(Object.keys(sim.links)).toHaveLength(0);
    expect(sim.budget).toBe(100);
  });

  it('cancelling an erase stroke restores the corner links it removed', () => {
    const sim = world();
    placeRoads(sim, [idx(0, 0), idx(1, 1)]);
    linkTiles(sim, idx(0, 0), idx(1, 1));
    const ctl = createController(sim);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'erase', at: { x: 0.5, y: 0.5 } },
      identity,
    );
    applyIntent(ctl, { type: 'stroke-cancel' }, identity);
    expect(sim.roads[idx(0, 0)]).toBe(1);
    expect(hasLink(sim.links, idx(0, 0), idx(1, 1))).toBe(true);
  });
});

describe('links that add no road', () => {
  it('a move that only links two existing roads reports a change, so the view redraws', () => {
    const sim = world();
    placeRoads(sim, [idx(0, 0), idx(1, 0)]);
    const ctl = createController(sim);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'draw', at: { x: 0.5, y: 0.5 } },
      identity,
    );
    const changed = applyIntent(
      ctl,
      { type: 'stroke-move', at: { x: 1.5, y: 0.5 } },
      identity,
    );
    expect(changed).toBe(true);
    expect(hasLink(sim.links, idx(0, 0), idx(1, 0))).toBe(true);
  });

  it('releasing off a tile centre still links the last tile of a loop back onto the main road', () => {
    const sim = world();
    drag(
      sim,
      'draw',
      { x: 4.5, y: 0.5 },
      [1.5, 2.5, 3.5, 4.5, 5.5].map((y) => ({ x: 4.5, y })),
    );
    // Loop out to the right and back towards the main road at (4,4), releasing off its centre.
    const ctl = createController(sim);
    applyIntent(
      ctl,
      { type: 'stroke-begin', mode: 'draw', at: { x: 4.5, y: 2.5 } },
      identity,
    );
    for (const p of [
      { x: 5.5, y: 2.5 },
      { x: 5.5, y: 3.5 },
      { x: 5.5, y: 4.5 },
      { x: 4.8, y: 4.5 },
    ]) {
      applyIntent(ctl, { type: 'stroke-move', at: p }, identity);
    }
    applyIntent(ctl, { type: 'stroke-end', at: { x: 4.8, y: 4.5 } }, identity);
    expect(hasLink(sim.links, idx(5, 4), idx(4, 4))).toBe(true);
  });
});
