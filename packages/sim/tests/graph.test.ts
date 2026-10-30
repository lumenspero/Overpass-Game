import { describe, expect, it } from 'vitest';
import {
  addLink,
  buildRoadGraph,
  canonicalGraph,
  createRng,
  createSim,
  linkTiles,
  type Links,
  nextFloat,
  placeRoads,
  removeRoads,
  unlinkTiles,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

type XY = [number, number];

/**
 * Builds a graph from drags. Each drag is a list of tiles the player's pointer passed
 * through, in order: every tile becomes a road, and every step between consecutive
 * tiles becomes a link, as the controller makes them.
 */
function drawn(cols: number, rows: number, drags: XY[][]) {
  const grid = makeGrid(cols, rows);
  const roads = new Array<number>(cols * rows).fill(0);
  const links: Links = {};
  for (const drag of drags) {
    for (let i = 0; i < drag.length; i++) {
      const [x, y] = drag[i];
      roads[at(grid, x, y)] = 1;
      if (i > 0) {
        const [px, py] = drag[i - 1];
        const a = at(grid, px, py);
        const b = at(grid, x, y);
        // Every step of a drag is a link, as the controller makes it.
        if (a !== b) addLink(links, a, b);
      }
    }
  }
  return { grid, roads, links, graph: buildRoadGraph(roads, links) };
}

describe('road graph shapes', () => {
  it('a straight line is two nodes joined by one edge of the right length', () => {
    const { graph, grid } = drawn(6, 1, [
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
      ],
    ]);
    expect(
      Object.keys(graph.nodes)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([at(grid, 0, 0), at(grid, 4, 0)]);
    const edges = Object.values(graph.edges);
    expect(edges).toHaveLength(1);
    expect(edges[0].length).toBe(4);
  });

  it('a T joins its arms through the centre tile', () => {
    const { graph, grid } = drawn(5, 5, [
      [
        [2, 0],
        [2, 1],
        [2, 2],
      ],
      [
        [0, 2],
        [1, 2],
        [2, 2],
      ],
      [
        [2, 2],
        [3, 2],
        [4, 2],
      ],
    ]);
    const centre = at(grid, 2, 2);
    const up = at(grid, 2, 1);
    const left = at(grid, 1, 2);
    expect(Object.keys(graph.nodes)).toContain(String(centre));
    // The up arm and the left arm are not linked to each other, only through the centre.
    const direct = Object.values(graph.edges).find(
      (e) =>
        e.tiles.length === 0 &&
        [e.from, e.to].sort((a, b) => a - b).join() ===
          [up, left].sort((a, b) => a - b).join(),
    );
    expect(direct).toBeUndefined();
  });

  it('a diagonal drag links its two tiles across the corner', () => {
    const { graph } = drawn(3, 3, [
      [
        [0, 0],
        [1, 1],
      ],
    ]);
    expect(Object.values(graph.edges).map((e) => e.length)).toEqual([1]);
  });

  it('two roads placed side by side do not join unless a drag joins them', () => {
    const { graph } = drawn(3, 1, [[[0, 0]], [[1, 0]]]);
    expect(Object.keys(graph.nodes)).toHaveLength(2);
    expect(Object.keys(graph.edges)).toHaveLength(0);
  });

  it('a closed drag is a loop with one node and no junctions', () => {
    const { graph } = drawn(3, 3, [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ]);
    expect(Object.keys(graph.nodes)).toHaveLength(1);
    const edges = Object.values(graph.edges);
    expect(edges).toHaveLength(1);
    expect(edges[0].length).toBe(4);
  });

  it('an isolated road tile is a node with no edges', () => {
    const { graph } = drawn(3, 3, [[[1, 1]]]);
    expect(Object.keys(graph.nodes)).toHaveLength(1);
    expect(Object.keys(graph.edges)).toHaveLength(0);
  });
});

describe('incremental graph updates', () => {
  it('removing the middle of a line splits it into two separate edges', () => {
    const grid = makeGrid(5, 1);
    const sim = createSim({ seed: 1, grid, roadBudget: 10 });
    placeRoads(sim, [0, 1, 2, 3, 4]);
    for (let i = 0; i < 4; i++) linkTiles(sim, i, i + 1);
    removeRoads(sim, [2]);
    expect(Object.values(sim.graph.edges).map((e) => e.length)).toEqual([1, 1]);
    expect(
      Object.keys(sim.graph.nodes)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([0, 1, 3, 4]);
  });

  it('stays identical to a full rebuild after 500 random edits', () => {
    const grid = makeGrid(10, 10);
    const sim = createSim({ seed: 2024, grid, roadBudget: 100_000 });
    const rng = createRng(7);
    for (let op = 0; op < 500; op++) {
      const tile = Math.floor(nextFloat(rng) * 100);
      const roll = nextFloat(rng);
      if (roll < 0.4) {
        placeRoads(sim, [tile]);
      } else if (roll < 0.6) {
        removeRoads(sim, [tile]);
      } else {
        // Link a tile to its right or lower neighbour, as a drag step would.
        const other = nextFloat(rng) < 0.5 ? tile + 1 : tile + 10;
        if (other < 100 && (other !== tile + 1 || tile % 10 !== 9)) {
          if (roll < 0.8) linkTiles(sim, tile, other);
          else unlinkTiles(sim, tile, other);
        }
      }
      const full = buildRoadGraph(sim.roads, sim.links);
      expect(canonicalGraph(sim.graph), `after op ${op}`).toEqual(
        canonicalGraph(full),
      );
    }
  });
});
