import { ROAD_WIDTH_TILES, TILE_SIZE } from '@overpass-game/render-style';
import {
  addLink,
  type Building,
  type Car,
  type Links,
  createGrid,
  Terrain,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import {
  buildingShapes,
  carShapes,
  DESTINATION_RADIUS,
  LANE_OFFSET,
  LOT_GAP,
  lotShapes,
  linksWithTabs,
  POP_MS,
  popScale,
  popShapes,
  roadShapes,
  terrainTiles,
} from './geometry.ts';

const R = (ROAD_WIDTH_TILES * TILE_SIZE) / 2;
const centre = (col: number, row: number) => ({
  x: (col + 0.5) * TILE_SIZE,
  y: (row + 0.5) * TILE_SIZE,
});

/** Links between the given pairs of tiles, as the sim stores them. */
function linked(pairs: Array<[number, number]>): Links {
  const links: Links = {};
  for (const [a, b] of pairs) addLink(links, a, b);
  return links;
}
const NONE: Links = {};

function roadsFrom(cols: number, rows: number, tiles: number[]): number[] {
  const roads = new Array<number>(cols * rows).fill(0);
  for (const i of tiles) roads[i] = 1;
  return roads;
}

describe('roadShapes', () => {
  it('draws a single tile as one disc and no bars', () => {
    const grid = createGrid(3, 3);
    const shapes = roadShapes(grid, roadsFrom(3, 3, [4]), NONE);
    expect(shapes).toEqual([{ kind: 'circle', ...centre(1, 1), r: R }]);
  });

  it('draws a disc on every road tile and one bar per link', () => {
    const grid = createGrid(4, 1);
    const shapes = roadShapes(
      grid,
      roadsFrom(4, 1, [0, 1, 2]),
      linked([
        [0, 1],
        [1, 2],
      ]),
    );
    const discs = shapes.filter((s) => s.kind === 'circle');
    const bars = shapes.filter((s) => s.kind === 'line');
    expect(discs).toHaveLength(3);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({
      kind: 'line',
      x1: centre(0, 0).x,
      y1: centre(0, 0).y,
      x2: centre(1, 0).x,
      y2: centre(1, 0).y,
      w: 2 * R,
    });
  });

  it('rounds an L-shaped corner with a quarter circle of discs, not a disc at the corner tile', () => {
    const grid = createGrid(2, 2);
    const shapes = roadShapes(
      grid,
      roadsFrom(2, 2, [0, 1, 3]),
      linked([
        [0, 1],
        [1, 3],
      ]),
    );
    const corner = centre(1, 0);
    expect(shapes).not.toContainEqual({ kind: 'circle', ...corner, r: R });
    // The bend turns round the tile corner (32, 32), half a tile from each edge midpoint.
    const o = { x: 32, y: 32 };
    const arc = shapes.flatMap((s) =>
      s.kind === 'circle' &&
      Math.abs(Math.hypot(s.x - o.x, s.y - o.y) - R * 2) < 1e-6
        ? [s]
        : [],
    );
    expect(arc).toHaveLength(17);
    expect(shapes.filter((s) => s.kind === 'line')).toHaveLength(2);
  });

  it('bridges diagonal tiles with one diagonal bar, and no edge bars', () => {
    const grid = createGrid(2, 2);
    const shapes = roadShapes(grid, roadsFrom(2, 2, [0, 3]), linked([[0, 3]]));
    expect(shapes.filter((s) => s.kind === 'rect')).toHaveLength(0);
    expect(shapes.filter((s) => s.kind === 'line')).toEqual([
      {
        kind: 'line',
        x1: centre(0, 0).x,
        y1: centre(0, 0).y,
        x2: centre(1, 1).x,
        y2: centre(1, 1).y,
        w: 2 * R,
      },
    ]);
  });

  it('draws a diagonal bar on the down-left pair too', () => {
    const grid = createGrid(2, 2);
    const shapes = roadShapes(grid, roadsFrom(2, 2, [1, 2]), linked([[1, 2]]));
    expect(shapes.filter((s) => s.kind === 'line')).toHaveLength(1);
  });

  it('does not join the end of one row to the start of the next', () => {
    // Tiles 2 and 3 are index-adjacent but sit at the row break.
    const grid = createGrid(3, 2);
    const shapes = roadShapes(grid, roadsFrom(3, 2, [2, 3]), NONE);
    expect(shapes.filter((s) => s.kind === 'rect')).toHaveLength(0);
  });

  it('draws nothing for an empty map', () => {
    const grid = createGrid(3, 3);
    expect(roadShapes(grid, roadsFrom(3, 3, []), NONE)).toEqual([]);
  });
});

describe('house driveways', () => {
  const house = (tile: number, entrance: 'e' | 'w' | 'n' | 's') =>
    ({ id: 9, kind: 'house', color: 0, tile, entrance }) as unknown as Building;

  it('joins a road that bends at a house stub to the house without a gap', () => {
    // As in play: a road comes down to (1,1) and turns east, and a house below at (1,2) faces up onto it.
    const grid = createGrid(4, 4);
    const north = 0 * 4 + 1;
    const stub = 1 * 4 + 1;
    const east = 1 * 4 + 2;
    const home = 2 * 4 + 1;
    const roads = roadsFrom(4, 4, [north, stub, east]);
    const links = linked([
      [north, stub],
      [stub, east],
    ]);
    const shapes = roadShapes(
      grid,
      roads,
      linksWithTabs([house(home, 'n')], grid, roads, links),
    );
    // With the driveway counted, the stub is a junction: full arms and a disc at its centre, not a bend.
    expect(shapes).toContainEqual({ kind: 'circle', ...centre(1, 1), r: R });
    expect(shapes).toContainEqual({
      kind: 'line',
      x1: centre(1, 1).x,
      y1: centre(1, 1).y,
      x2: centre(1, 2).x,
      y2: centre(1, 2).y,
      w: 2 * R,
    });
  });

  it('rounds a road that turns into a house, like any other bend', () => {
    // A road from the west ends at (1,1), and the house above at (1,0) faces down onto it.
    const grid = createGrid(3, 3);
    const west = 1 * 3 + 0;
    const stub = 1 * 3 + 1;
    const home = 0 * 3 + 1;
    const roads = roadsFrom(3, 3, [west, stub]);
    const shapes = roadShapes(
      grid,
      roads,
      linksWithTabs([house(home, 's')], grid, roads, linked([[west, stub]])),
    );
    expect(shapes).not.toContainEqual({
      kind: 'circle',
      ...centre(1, 1),
      r: R,
    });
    const corner = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE };
    const arc = shapes.filter(
      (s) =>
        s.kind === 'circle' &&
        Math.abs(Math.hypot(s.x - corner.x, s.y - corner.y) - 2 * R) < 1e-6,
    );
    expect(arc.length).toBeGreaterThan(0);
  });

  it('adds no driveway while the stub tile has no road', () => {
    const grid = createGrid(3, 1);
    const out = linksWithTabs([house(0, 'e')], grid, roadsFrom(3, 1, []), {});
    expect(out[0]).toBeUndefined();
    expect(out[1]).toBeUndefined();
  });

  it('does not treat a house stub on a diagonal as a bend', () => {
    // A stub moved to a corner gives a diagonal driveway; with a straight road it is not a quarter circle.
    const grid = createGrid(3, 3);
    const stub = 1 * 3 + 1;
    const east = 1 * 3 + 2;
    const home = 0 * 3 + 0;
    const b = { ...house(home, 'e'), stub } as Building;
    const roads = roadsFrom(3, 3, [stub, east]);
    const shapes = roadShapes(
      grid,
      roads,
      linksWithTabs([b], grid, roads, linked([[stub, east]])),
    );
    expect(shapes).toContainEqual({ kind: 'circle', ...centre(1, 1), r: R });
  });
});

describe('cars at a house whose road bends into it', () => {
  // The house at (1,0) faces down onto its stub (1,1); the road reaches the stub from the west, (0,1).
  // Drawn with the driveway, the stub is a bend round the tile corner (1,1), a band 0.25 to 0.75 tiles out.
  const grid = createGrid(3, 3);
  const colors = [0xff0000];
  const home: Building = {
    id: 0,
    kind: 'house',
    color: 0,
    tile: 1,
    entrance: 's',
  };
  const west = 3;
  const stub = 4;
  const links = linked([[west, stub]]);
  const corner = { x: TILE_SIZE, y: TILE_SIZE };
  const trip =
    (state: 'driving' | 'returning', route: number[], progress: number) =>
    (along: number): Car => ({
      id: 0,
      house: 0,
      destination: 1,
      state,
      route,
      progress,
      along,
      timer: 0,
    });

  for (const [name, make] of [
    ['entering the house', trip('returning', [west, stub], 1)],
    ['leaving the house', trip('driving', [stub, west], 0)],
  ] as const) {
    it(`follows the bend's curve in its lane, ${name}`, () => {
      let onStub = 0;
      let lo = Infinity;
      let hi = 0;
      for (let i = 0; i <= 40; i++) {
        const [dot] = carShapes(
          [make(i / 40)],
          [home],
          grid,
          colors,
          [],
          {},
          links,
        );
        if (!dot) throw new Error('no car drawn');
        const inside =
          dot.x >= TILE_SIZE &&
          dot.x <= 2 * TILE_SIZE &&
          dot.y >= TILE_SIZE &&
          dot.y <= 2 * TILE_SIZE;
        if (!inside) continue;
        onStub += 1;
        // A car is about 0.1 tiles wide either side of its lane, so it keeps 0.1 inside each curb.
        const r = Math.hypot(dot.x - corner.x, dot.y - corner.y) / TILE_SIZE;
        expect(r).toBeGreaterThanOrEqual(0.35);
        expect(r).toBeLessThanOrEqual(0.65);
        lo = Math.min(lo, r);
        hi = Math.max(hi, r);
      }
      expect(onStub).toBeGreaterThan(5);
      // It keeps its lane's distance from the corner, so it runs parallel to the curb rather than cutting across.
      expect(hi - lo).toBeLessThan(0.02);
    });
  }
});

describe('popping buildings in', () => {
  it('grows from nothing, overshoots, and settles at full size', () => {
    expect(popScale(0)).toBe(0);
    expect(popScale(POP_MS)).toBe(1);
    expect(popScale(POP_MS * 10)).toBe(1);
    let peak = 0;
    for (let ms = 0; ms <= POP_MS; ms += POP_MS / 50) {
      peak = Math.max(peak, popScale(ms));
    }
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.25);
  });

  it('scales a building about its own centre', () => {
    const shapes = popShapes(
      [
        { kind: 'square', x: 10, y: 20, size: 40, color: 1, large: false },
        { kind: 'entrance', x1: 50, y1: 40, x2: 60, y2: 40 },
      ],
      0.5,
    );
    expect(shapes[0]).toEqual({
      kind: 'square',
      x: 20,
      y: 30,
      size: 20,
      color: 1,
      large: false,
    });
    expect(shapes[1]).toEqual({
      kind: 'entrance',
      x1: 40,
      y1: 40,
      x2: 45,
      y2: 40,
    });
  });
});

describe('terrainTiles', () => {
  it('lists non-land tiles with their world positions', () => {
    const grid = createGrid(3, 2);
    grid.terrain[1] = Terrain.Water;
    grid.terrain[5] = Terrain.Mountain;
    expect(terrainTiles(grid)).toEqual([
      { x: TILE_SIZE, y: 0, kind: Terrain.Water },
      { x: 2 * TILE_SIZE, y: TILE_SIZE, kind: Terrain.Mountain },
    ]);
  });

  it('returns nothing for an all-land grid', () => {
    expect(terrainTiles(createGrid(4, 4))).toEqual([]);
  });
});

describe('buildingShapes', () => {
  const colors = [0xff0000, 0x00ff00];
  const grid = createGrid(3, 3);
  const house: Building = {
    id: 0,
    kind: 'house',
    color: 1,
    tile: 4,
    entrance: 'e',
  };
  const dest: Building = {
    id: 1,
    kind: 'destination',
    color: 0,
    tile: 0,
    entrance: 's',
  };

  it('draws houses as squares and destinations as discs, in their colours', () => {
    const shapes = buildingShapes([house, dest], grid, colors);
    expect(shapes.find((s) => s.kind === 'square')).toMatchObject({
      color: 0x00ff00,
    });
    expect(shapes.find((s) => s.kind === 'circle')).toMatchObject({
      color: 0xff0000,
    });
  });

  it('centres the body on its tile', () => {
    const [body] = buildingShapes([house], grid, colors);
    expect(body.kind).toBe('square');
    if (body.kind !== 'square') return;
    expect(body.x + body.size / 2).toBeCloseTo(1.5 * TILE_SIZE);
    expect(body.y + body.size / 2).toBeCloseTo(1.5 * TILE_SIZE);
  });

  it('runs the entrance tick from the body edge to the tile edge, on the entrance side', () => {
    const [, tick] = buildingShapes([house], grid, colors);
    expect(tick.kind).toBe('entrance');
    if (tick.kind !== 'entrance') return;
    // House on tile (1,1) facing east: tick ends on the right edge of the tile.
    expect(tick.x2).toBeCloseTo(2 * TILE_SIZE);
    expect(tick.y2).toBeCloseTo(1.5 * TILE_SIZE);
    expect(tick.x1).toBeLessThan(tick.x2);
    expect(tick.y1).toBeCloseTo(tick.y2);
  });

  it('centres a destination disc on its 3×3 footprint, at the destination radius', () => {
    // Origin (3,3) facing north: the footprint is columns 5-7 and rows 3-5 of an 8×8 grid.
    const big = createGrid(8, 8);
    const d: Building = {
      id: 2,
      kind: 'destination',
      color: 0,
      tile: 3 * 8 + 3,
      entrance: 'n',
    };
    expect(buildingShapes([d], big, colors)).toEqual([
      {
        kind: 'circle',
        x: 6.5 * TILE_SIZE,
        y: 4.5 * TILE_SIZE,
        r: DESTINATION_RADIUS,
        color: 0xff0000,
      },
    ]);
  });

  it('falls back to the first colour for an unknown colour index', () => {
    const [body] = buildingShapes([{ ...house, color: 9 }], grid, colors);
    expect(body).toMatchObject({ color: 0xff0000 });
  });
});

describe('carShapes', () => {
  const grid = createGrid(4, 1);
  const colors = [0xff0000, 0x00ff00];
  const house: Building = {
    id: 0,
    kind: 'house',
    color: 1,
    tile: 0,
    entrance: 'e',
  };
  const car = (progress: number, along: number): Car => ({
    id: 0,
    house: 0,
    destination: 1,
    state: 'driving',
    route: [0, 1, 2, 3],
    progress,
    along,
    timer: 0,
  });

  it('enters a tile at its entry edge and leaves at its exit edge', () => {
    const [start] = carShapes([car(1, 0)], [house], grid, colors);
    expect(start.x).toBeCloseTo(TILE_SIZE); // left edge of tile 1
    const [end] = carShapes([car(1, 1)], [house], grid, colors);
    expect(end.x).toBeCloseTo(2 * TILE_SIZE); // right edge of tile 1
    expect(end.y).toBeCloseTo(TILE_SIZE / 2 + LANE_OFFSET); // right-hand lane
  });

  it('enters its first tile from behind, in the right-hand lane', () => {
    const [dot] = carShapes([car(0, 0)], [house], grid, colors);
    expect(dot.x).toBeCloseTo(0);
    expect(dot.y).toBeCloseTo(TILE_SIZE / 2 + LANE_OFFSET);
  });

  it('keeps going in the same direction on the last tile', () => {
    const [dot] = carShapes([car(3, 1)], [house], grid, colors);
    expect(dot.x).toBeCloseTo(4 * TILE_SIZE); // far edge of the last tile
  });

  it('takes the colour of its house', () => {
    const [dot] = carShapes([car(1, 0)], [house], grid, colors);
    expect(dot.color).toBe(0x00ff00);
  });
});

describe('carShapes on a bend', () => {
  it('follows the corner through the tile centre instead of cutting across it', () => {
    // Tile 1 is the corner: the route comes in from the west and leaves to the south.
    const grid = createGrid(2, 2);
    const car: Car = {
      id: 0,
      house: 0,
      destination: 1,
      state: 'driving',
      route: [0, 1, 3],
      progress: 1,
      along: 0.5,
      timer: 0,
    };
    const house: Building = {
      id: 0,
      kind: 'house',
      color: 0,
      tile: 0,
      entrance: 'e',
    };
    const [dot] = carShapes([car], [house], grid, [0xff0000]);
    // Halfway through the bend, in the right-hand (inside) lane: on the quarter circle round the corner
    // (32, 32), 12 px from it. The road's inside edge is 8 px from that corner, so the car keeps clear of it.
    expect(dot.x).toBeCloseTo(32 + 12 * Math.SQRT1_2);
    expect(dot.y).toBeCloseTo(32 - 12 * Math.SQRT1_2);
  });

  it('is no bigger than the road it drives on', () => {
    const grid = createGrid(2, 1);
    const car: Car = {
      id: 0,
      house: 0,
      destination: 1,
      state: 'driving',
      route: [0, 1],
      progress: 0,
      along: 0,
      timer: 0,
    };
    const house: Building = {
      id: 0,
      kind: 'house',
      color: 0,
      tile: 0,
      entrance: 'e',
    };
    const [dot] = carShapes([car], [house], grid, [0xff0000]);
    expect(dot.r).toBeLessThan((ROAD_WIDTH_TILES * TILE_SIZE) / 2);
  });
});

describe('lotShapes', () => {
  // Origin (3,3) facing north: the lot is columns 3-7 and rows 3-5. Its road is (3,2) and its inlet (3,3).
  const big = createGrid(8, 8);
  const d: Building = {
    id: 2,
    kind: 'destination',
    color: 0,
    tile: 3 * 8 + 3,
    entrance: 'n',
  };
  const width = ROAD_WIDTH_TILES * TILE_SIZE;

  it("covers a destination's 5×3 lot with rounded pavement, inset at its short ends", () => {
    const [lot] = lotShapes([d], big);
    expect(lot).toMatchObject({
      kind: 'roundrect',
      x: 3 * TILE_SIZE + LOT_GAP / 2,
      y: 3 * TILE_SIZE,
      w: 5 * TILE_SIZE - LOT_GAP,
      h: 3 * TILE_SIZE,
    });
  });

  it('has a road-width tab from the access road centre into the inlet, with rounded ends', () => {
    const shape = lotShapes([d], big)[1];
    if (shape.kind !== 'roundrect') throw new Error('expected a tab');
    expect(shape.r).toBeCloseTo(width / 2);
    expect(shape.w).toBeCloseTo(width);
    // The far cap is centred on the road (3.5, 2.5) and the tab runs 0.3 tiles into the lot (to 3.8).
    expect(shape.x).toBeCloseTo(3.25 * TILE_SIZE);
    expect(shape.y).toBeCloseTo(2.25 * TILE_SIZE);
    expect(shape.y + shape.h).toBeCloseTo(3.8 * TILE_SIZE);
  });

  it('keeps the tab in the footprint even before a road node is placed', () => {
    const shapes = lotShapes([d], big);
    expect(shapes).toHaveLength(2);
    expect(shapes[1].kind).toBe('roundrect');
  });

  it('draws no lot for a house', () => {
    const house: Building = {
      id: 0,
      kind: 'house',
      color: 0,
      tile: 0,
      entrance: 'e',
    };
    expect(lotShapes([house], big)).toEqual([]);
  });
});

describe('cars entering a house', () => {
  it('drives in on its lane of the road, then on its own lane into the doorway', () => {
    // A road comes down from the north into the stub at tile (1,1), and the house at (2,1) lies east of it.
    const grid = createGrid(4, 3);
    const car: Car = {
      id: 0,
      house: 0,
      destination: 0,
      state: 'returning',
      route: [1, 5],
      progress: 1,
      along: 1,
      timer: 0,
    };
    const house: Building = {
      id: 0,
      kind: 'house',
      color: 0,
      tile: 6,
      entrance: 'w',
    };
    const [dot] = carShapes([car], [house], grid, [0xff0000]);
    // Travelling east into the house, the right-hand lane is the south side of the house's centre line.
    expect(dot?.y).toBeCloseTo(1.5 * TILE_SIZE + LANE_OFFSET, 3);
    expect(dot?.x).toBeCloseTo(2.5 * TILE_SIZE, 3);
  });
});

describe('linksWithTabs', () => {
  // As in lotShapes: the lot at (3,3) faces north, its road is (3,2) and its inlet (3,3).
  const grid = createGrid(8, 8);
  const d: Building = {
    id: 0,
    kind: 'destination',
    color: 0,
    tile: 3 * 8 + 3,
    entrance: 'n',
  };
  const road = 2 * 8 + 3;
  const west = 2 * 8 + 2;
  const inlet = 3 * 8 + 3;

  it('rounds a road that turns into a lot inlet, like any other bend', () => {
    const roads = new Array<number>(64).fill(0);
    roads[road] = 1;
    roads[west] = 1;
    const links = linked([[west, road]]);
    const shapes = roadShapes(
      grid,
      roads,
      linksWithTabs([d], grid, roads, links),
    );
    // A bend has no disc at its centre; its discs run round the tile corner the road turns about.
    const c = centre(3, 2);
    expect(shapes).not.toContainEqual({ kind: 'circle', ...c, r: R });
    const corner = { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE };
    const arc = shapes.flatMap((s) =>
      s.kind === 'circle' &&
      Math.abs(Math.hypot(s.x - corner.x, s.y - corner.y) - 2 * R) < 1e-6
        ? [s]
        : [],
    );
    expect(arc.length).toBeGreaterThan(0);
    // The lot draws no tab of its own once its road is placed; the roads draw it.
    expect(lotShapes([d], grid, roads)).toHaveLength(1);
  });

  it('leaves the links the sim holds unchanged', () => {
    const roads = new Array<number>(64).fill(0);
    roads[road] = 1;
    roads[west] = 1;
    const links = linked([[west, road]]);
    const before = JSON.stringify(links);
    linksWithTabs([d], grid, roads, links);
    expect(JSON.stringify(links)).toBe(before);
  });

  it('adds no tab link while the access road is not placed', () => {
    const roads = new Array<number>(64).fill(0);
    const out = linksWithTabs([d], grid, roads, {});
    expect(out[road]).toBeUndefined();
    expect(out[inlet]).toBeUndefined();
  });
});
