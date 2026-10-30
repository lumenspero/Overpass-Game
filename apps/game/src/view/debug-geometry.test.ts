import { TILE_SIZE } from '@overpass-game/render-style';
import {
  buildRoadGraph,
  createGrid,
  createSim,
  placeRoads,
  removeRoads,
  type RoadGraph,
  type SimState,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { debugShapes } from './debug-geometry.ts';

function sim(cols: number, rows: number, tiles: number[]): SimState {
  const s = createSim({
    seed: 1,
    grid: createGrid(cols, rows),
    roadBudget: 100,
  });
  placeRoads(s, tiles);
  return s;
}

/** Centre of a tile index, in world units. */
const centreOf = (i: number, cols: number) => ({
  x: ((i % cols) + 0.5) * TILE_SIZE,
  y: (Math.floor(i / cols) + 0.5) * TILE_SIZE,
});

/** Every tile index that the overlay's edges and nodes touch. */
function tilesDrawn(s: SimState, graph: RoadGraph): Set<number> {
  const shapes = debugShapes(s.grid, graph);
  const drawn = new Set<number>();
  for (const i of s.roads.keys()) {
    if (s.roads[i] !== 1) continue;
    const c = centreOf(i, s.grid.cols);
    const onEdge = shapes.edges.some(
      (e) => (e.x1 === c.x && e.y1 === c.y) || (e.x2 === c.x && e.y2 === c.y),
    );
    const onNode = shapes.nodes.some((n) => n.x === c.x && n.y === c.y);
    if (onEdge || onNode) drawn.add(i);
  }
  return drawn;
}

describe('debugShapes', () => {
  it('draws the grid lines for every tile boundary', () => {
    const s = sim(4, 3, []);
    const { grid } = debugShapes(s.grid, s.graph);
    expect(grid).toHaveLength(4 + 1 + 3 + 1);
  });

  it('has no edges or nodes on an empty map', () => {
    const s = sim(4, 3, []);
    const shapes = debugShapes(s.grid, s.graph);
    expect(shapes.edges).toEqual([]);
    expect(shapes.nodes).toEqual([]);
  });

  it('draws one node per graph node and one segment per edge step', () => {
    // A T whose arms touch at corners: every tile where the links change is a node.
    const s = sim(5, 5, [2, 7, 12, 11, 13]);
    const shapes = debugShapes(s.grid, s.graph);
    expect(shapes.nodes).toHaveLength(Object.keys(s.graph.nodes).length);
    const steps = Object.values(s.graph.edges).reduce(
      (n, e) => n + e.length,
      0,
    );
    expect(shapes.edges).toHaveLength(steps);
  });

  it('shows every road tile exactly on a node or edge', () => {
    const s = sim(5, 5, [2, 7, 12, 11, 13, 14]);
    const drawn = tilesDrawn(s, s.graph);
    const roads = s.roads.flatMap((r, i) => (r === 1 ? [i] : []));
    expect([...drawn].sort((a, b) => a - b)).toEqual(roads);
  });

  it('shows a 2×2 block as four linked junctions with six edges', () => {
    // Every tile touches the other three, so each is a junction and each pair has an edge.
    const s = sim(4, 4, [5, 6, 10, 9]);
    const shapes = debugShapes(s.grid, s.graph);
    expect(shapes.nodes).toHaveLength(4);
    expect(shapes.edges).toHaveLength(6);
    expect(tilesDrawn(s, s.graph).size).toBe(4);
  });

  it('matches a full rebuild after an incremental edit', () => {
    const s = sim(6, 4, [0, 1, 2, 8, 14, 15]);
    removeRoads(s, [1]);
    placeRoads(s, [3, 9]);
    const rebuilt = buildRoadGraph(s.grid, s.roads);
    // Edge order depends on build order, so compare the shapes as sets.
    const sorted = (shapes: ReturnType<typeof debugShapes>) => ({
      grid: shapes.grid.map((g) => JSON.stringify(g)).sort(),
      edges: shapes.edges.map((e) => JSON.stringify(e)).sort(),
      nodes: shapes.nodes.map((n) => JSON.stringify(n)).sort(),
    });
    expect(sorted(debugShapes(s.grid, s.graph))).toEqual(
      sorted(debugShapes(s.grid, rebuilt)),
    );
  });
});
