import { createGrid, linkPartners } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { previewRoads } from './crossing-preview.ts';

describe('previewRoads', () => {
  it('marks each path tile as road and links consecutive tiles, corners included', () => {
    const grid = createGrid(4, 4);
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ];
    const { roads, links } = previewRoads(grid, path);
    expect(roads.reduce((a, b) => a + b, 0)).toBe(3);
    expect(linkPartners(links, 0)).toEqual([5]);
    expect(linkPartners(links, 5)).toEqual([0, 9]);
  });

  it('skips tiles off the map', () => {
    const grid = createGrid(2, 2);
    const { roads } = previewRoads(grid, [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(roads.reduce((a, b) => a + b, 0)).toBe(1);
  });
});
