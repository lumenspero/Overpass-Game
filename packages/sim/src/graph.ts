import { type Links, type Grid, linkNeighbors, roadLinks } from './grid.ts';

/**
 * A road edge is a chain of road tiles between two nodes. Nodes are road tiles
 * that are not a simple pass-through (dead ends, junctions, isolated tiles),
 * plus one representative tile for any closed loop that has no such tile.
 *
 * Everything is plain data keyed by strings so the graph serializes as JSON.
 */
export interface RoadEdge {
  key: string;
  from: number;
  to: number;
  /** Interior tiles only, ordered from `from` to `to`. */
  tiles: number[];
  /** Number of steps along the edge (interior tiles + 1). */
  length: number;
}

export interface RoadGraph {
  /** Node tile index (as string) -> keys of its incident edges. */
  nodes: Record<string, string[]>;
  edges: Record<string, RoadEdge>;
  /** Interior tile index (as string) -> key of the edge it belongs to. */
  tileEdge: Record<string, string>;
}

export function createEmptyGraph(): RoadGraph {
  return { nodes: {}, edges: {}, tileEdge: {} };
}

function roadNeighbors(roads: number[], links: Links, index: number): number[] {
  return roadLinks(roads, links, index);
}

/** Flood-fills the road tiles connected to `start`, marking them in `visited`. */
function collectComponent(
  roads: number[],
  links: Links,
  start: number,
  visited: Set<number>,
): number[] {
  const tiles: number[] = [];
  const stack = [start];
  visited.add(start);
  while (stack.length > 0) {
    const current = stack.pop() as number;
    tiles.push(current);
    for (const n of roadNeighbors(roads, links, current)) {
      if (!visited.has(n)) {
        visited.add(n);
        stack.push(n);
      }
    }
  }
  return tiles;
}

function addEdge(
  graph: RoadGraph,
  start: number,
  end: number,
  interior: number[],
): void {
  // Canonical direction: from the smaller endpoint to the larger. A loop (start === end)
  // is oriented by its interior list instead. This makes the stored edge independent of
  // the order in which the graph was built, which the incremental update relies on.
  let from = start;
  let to = end;
  let tiles = interior;
  if (from > to) {
    [from, to] = [to, from];
    tiles = [...interior].reverse();
  } else if (
    from === to &&
    interior.length > 1 &&
    interior[0] > interior[interior.length - 1]
  ) {
    tiles = [...interior].reverse();
  }
  const key = tiles.length === 0 ? `d${from}-${to}` : `t${tiles[0]}`;
  if (graph.edges[key]) return;
  graph.edges[key] = { key, from, to, tiles, length: tiles.length + 1 };
  graph.nodes[String(from)].push(key);
  if (to !== from) graph.nodes[String(to)].push(key);
  for (const t of tiles) graph.tileEdge[String(t)] = key;
}

/** Builds nodes and edges for one connected set of road tiles. */
function buildComponent(
  graph: RoadGraph,
  roads: number[],
  links: Links,
  tiles: number[],
): void {
  let nodeTiles = tiles.filter(
    (t) => roadNeighbors(roads, links, t).length !== 2,
  );
  if (nodeTiles.length === 0) {
    // Pure loop: every tile is pass-through, so promote the smallest one.
    nodeTiles = [Math.min(...tiles)];
  }
  const nodeSet = new Set(nodeTiles);
  for (const n of nodeTiles) graph.nodes[String(n)] = [];

  for (const n of nodeTiles) {
    for (const first of roadNeighbors(roads, links, n)) {
      const interior: number[] = [];
      let prev = n;
      let current = first;
      while (!nodeSet.has(current)) {
        interior.push(current);
        const next = roadNeighbors(roads, links, current).find(
          (t) => t !== prev,
        );
        if (next === undefined)
          throw new Error(`road tile ${current} has no onward neighbour`);
        prev = current;
        current = next;
      }
      addEdge(graph, n, current, interior);
    }
  }
}

/** Builds the road graph from scratch. */
export function buildRoadGraph(roads: number[], links: Links): RoadGraph {
  const graph = createEmptyGraph();
  const visited = new Set<number>();
  for (let i = 0; i < roads.length; i++) {
    if (roads[i] === 1 && !visited.has(i)) {
      buildComponent(
        graph,
        roads,
        links,
        collectComponent(roads, links, i, visited),
      );
    }
  }
  return graph;
}

/**
 * Updates the graph after `changed` tiles were added to or removed from the road set,
 * or after a link was added or removed between them. `roads` and `links` must
 * already reflect the change. Only the connected components near the changed tiles are
 * rebuilt; the rest of the graph is left untouched.
 */
export function updateRoadGraph(
  graph: RoadGraph,
  grid: Grid,
  roads: number[],
  links: Links,
  changed: number[],
): void {
  // 1. Tiles whose neighbourhood changed.
  const seeds = new Set<number>();
  for (const c of changed) {
    seeds.add(c);
    for (const n of linkNeighbors(grid, c)) seeds.add(n);
  }

  // 2. Every old node and edge in the components that touch the seeds.
  const oldNodes = new Set<number>();
  const oldEdges = new Set<string>();
  const pending: number[] = [];
  const visitNode = (n: number): void => {
    if (!oldNodes.has(n)) {
      oldNodes.add(n);
      pending.push(n);
    }
  };
  const visitEdge = (key: string): void => {
    if (oldEdges.has(key)) return;
    oldEdges.add(key);
    const edge = graph.edges[key];
    visitNode(edge.from);
    visitNode(edge.to);
  };

  for (const s of seeds) {
    if (graph.nodes[String(s)] !== undefined) visitNode(s);
    else if (graph.tileEdge[String(s)] !== undefined)
      visitEdge(graph.tileEdge[String(s)]);
  }
  while (pending.length > 0) {
    const n = pending.pop() as number;
    for (const key of graph.nodes[String(n)]) visitEdge(key);
  }

  // 3. Remove them.
  for (const key of oldEdges) {
    const edge = graph.edges[key];
    for (const t of edge.tiles) delete graph.tileEdge[String(t)];
    delete graph.edges[key];
  }
  for (const n of oldNodes) delete graph.nodes[String(n)];

  // 4. Rebuild the components that now contain seed tiles.
  const visited = new Set<number>();
  for (const s of seeds) {
    if (roads[s] === 1 && !visited.has(s)) {
      buildComponent(
        graph,
        roads,
        links,
        collectComponent(roads, links, s, visited),
      );
    }
  }
}

/** Order-independent view of a graph, for comparing an incremental build with a full rebuild. */
export function canonicalGraph(graph: RoadGraph): unknown {
  const nodeKeys = Object.keys(graph.nodes).sort(
    (a, b) => Number(a) - Number(b),
  );
  return {
    nodes: nodeKeys.map((k) => [Number(k), [...graph.nodes[k]].sort()]),
    edges: Object.keys(graph.edges)
      .sort()
      .map((k) => graph.edges[k]),
    tileEdge: Object.keys(graph.tileEdge)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => [Number(k), graph.tileEdge[k]]),
  };
}
