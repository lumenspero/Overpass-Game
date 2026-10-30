import { describe, expect, it } from 'vitest';
import {
  buildRoadGraph,
  canonicalGraph,
  createRng,
  createSim,
  nextFloat,
  placeRoads,
  removeRoads,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

function build(cols: number, rows: number, tiles: Array<[number, number]>) {
  const grid = makeGrid(cols, rows);
  const roads = new Array<number>(cols * rows).fill(0);
  for (const [x, y] of tiles) roads[at(grid, x, y)] = 1;
  return { grid, roads, graph: buildRoadGraph(grid, roads) };
}

describe('road graph shapes', () => {
  it('a straight line is two nodes joined by one edge of the right length', () => {
    const { graph, grid } = build(6, 1, [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
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

  it('a T junction has a junction node and three edges', () => {
    const { graph, grid } = build(5, 5, [
      [2, 2],
      [2, 1],
      [2, 0], // up arm
      [1, 2],
      [0, 2], // left arm
      [3, 2],
      [4, 2], // right arm
    ]);
    expect(graph.nodes[String(at(grid, 2, 2))]).toHaveLength(3);
    const edges = Object.values(graph.edges);
    expect(edges).toHaveLength(3);
    expect(edges.map((e) => e.length).sort()).toEqual([2, 2, 2]);
  });

  it('a closed 2x2 loop becomes one node with a loop edge', () => {
    const { graph } = build(3, 3, [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
    expect(Object.keys(graph.nodes)).toHaveLength(1);
    const edges = Object.values(graph.edges);
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe(edges[0].to);
    expect(edges[0].length).toBe(4);
  });

  it('an isolated road tile is a node with no edges', () => {
    const { graph } = build(3, 3, [[1, 1]]);
    expect(Object.keys(graph.nodes)).toHaveLength(1);
    expect(Object.keys(graph.edges)).toHaveLength(0);
  });
});

describe('incremental graph updates', () => {
  it('removing the middle of a line splits it into two separate edges', () => {
    const grid = makeGrid(5, 1);
    const sim = createSim({ seed: 1, grid, roadBudget: 10 });
    placeRoads(sim, [0, 1, 2, 3, 4]);
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
      if (nextFloat(rng) < 0.6) {
        placeRoads(sim, [tile]);
      } else {
        removeRoads(sim, [tile]);
      }
      const full = buildRoadGraph(sim.grid, sim.roads);
      expect(canonicalGraph(sim.graph), `after op ${op}`).toEqual(
        canonicalGraph(full),
      );
    }
  });
});
