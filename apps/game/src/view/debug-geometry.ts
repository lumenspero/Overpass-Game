import { TILE_SIZE } from '@overpass-game/render-style';
import type { Grid, RoadGraph } from '@overpass-game/sim';

/**
 * Debug overlay geometry, derived from the sim's road graph. Pure, world units.
 * Nothing here computes its own graph: the overlay shows what the sim holds.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DebugShapes {
  /** Tile boundary lines across the whole grid. */
  grid: Segment[];
  /** One segment per step along every graph edge: node, interior tiles, node. */
  edges: Segment[];
  /** One marker per graph node. */
  nodes: Point[];
}

function centre(index: number, cols: number): Point {
  return {
    x: ((index % cols) + 0.5) * TILE_SIZE,
    y: (Math.floor(index / cols) + 0.5) * TILE_SIZE,
  };
}

export function debugShapes(grid: Grid, graph: RoadGraph): DebugShapes {
  const width = grid.cols * TILE_SIZE;
  const height = grid.rows * TILE_SIZE;
  const lines: Segment[] = [];
  for (let x = 0; x <= grid.cols; x++) {
    lines.push({ x1: x * TILE_SIZE, y1: 0, x2: x * TILE_SIZE, y2: height });
  }
  for (let y = 0; y <= grid.rows; y++) {
    lines.push({ x1: 0, y1: y * TILE_SIZE, x2: width, y2: y * TILE_SIZE });
  }

  const edges: Segment[] = [];
  for (const edge of Object.values(graph.edges)) {
    const points = [edge.from, ...edge.tiles, edge.to].map((i) =>
      centre(i, grid.cols),
    );
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }

  const nodes = Object.keys(graph.nodes).map((k) =>
    centre(Number(k), grid.cols),
  );
  return { grid: lines, edges, nodes };
}
