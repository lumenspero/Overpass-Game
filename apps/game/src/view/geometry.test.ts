import { ROAD_WIDTH_TILES, TILE_SIZE } from '@overpass-game/render-style';
import {
  type Building,
  type Car,
  createGrid,
  Terrain,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import {
  buildingShapes,
  carShapes,
  LANE_OFFSET,
  roadShapes,
  terrainTiles,
} from './geometry.ts';

const R = (ROAD_WIDTH_TILES * TILE_SIZE) / 2;
const centre = (col: number, row: number) => ({
  x: (col + 0.5) * TILE_SIZE,
  y: (row + 0.5) * TILE_SIZE,
});

function roadsFrom(cols: number, rows: number, tiles: number[]): number[] {
  const roads = new Array<number>(cols * rows).fill(0);
  for (const i of tiles) roads[i] = 1;
  return roads;
}

describe('roadShapes', () => {
  it('draws a single tile as one disc and no bars', () => {
    const grid = createGrid(3, 3);
    const shapes = roadShapes(grid, roadsFrom(3, 3, [4]));
    expect(shapes).toEqual([{ kind: 'circle', ...centre(1, 1), r: R }]);
  });

  it('draws a disc on every road tile and one bar per adjacent pair', () => {
    const grid = createGrid(4, 1);
    const shapes = roadShapes(grid, roadsFrom(4, 1, [0, 1, 2]));
    const discs = shapes.filter((s) => s.kind === 'circle');
    const bars = shapes.filter((s) => s.kind === 'rect');
    expect(discs).toHaveLength(3);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({
      kind: 'rect',
      x: centre(0, 0).x,
      y: centre(0, 0).y - R,
      w: TILE_SIZE,
      h: 2 * R,
    });
  });

  it('rounds an L-shaped corner with a disc at the corner tile', () => {
    const grid = createGrid(2, 2);
    const shapes = roadShapes(grid, roadsFrom(2, 2, [0, 1, 3]));
    const corner = centre(1, 0);
    expect(shapes).toContainEqual({ kind: 'circle', ...corner, r: R });
    expect(shapes.filter((s) => s.kind === 'rect')).toHaveLength(2);
  });

  it('bridges diagonal tiles with one diagonal bar, and no edge bars', () => {
    const grid = createGrid(2, 2);
    const shapes = roadShapes(grid, roadsFrom(2, 2, [0, 3]));
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
    const shapes = roadShapes(grid, roadsFrom(2, 2, [1, 2]));
    expect(shapes.filter((s) => s.kind === 'line')).toHaveLength(1);
  });

  it('does not join the end of one row to the start of the next', () => {
    // Tiles 2 and 3 are index-adjacent but sit at the row break.
    const grid = createGrid(3, 2);
    const shapes = roadShapes(grid, roadsFrom(3, 2, [2, 3]));
    expect(shapes.filter((s) => s.kind === 'rect')).toHaveLength(0);
  });

  it('draws nothing for an empty map', () => {
    const grid = createGrid(3, 3);
    expect(roadShapes(grid, roadsFrom(3, 3, []))).toEqual([]);
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
    // Halfway through the bend, in the right-hand lane: inside the corner, not on the chord to the outer corner.
    expect(dot.x).toBeCloseTo(42);
    expect(dot.y).toBeCloseTo(22);
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
