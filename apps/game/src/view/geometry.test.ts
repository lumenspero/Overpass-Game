import { ROAD_WIDTH_TILES, TILE_SIZE } from '@overpass-game/render-style';
import { createGrid, type Building, Terrain } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { buildingShapes, roadShapes, terrainTiles } from './geometry.ts';

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

  it('does not bridge diagonal tiles', () => {
    const grid = createGrid(2, 2);
    const shapes = roadShapes(grid, roadsFrom(2, 2, [0, 3]));
    expect(shapes.filter((s) => s.kind === 'rect')).toHaveLength(0);
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
