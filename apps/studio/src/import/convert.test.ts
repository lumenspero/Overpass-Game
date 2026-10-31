import { describe, expect, it } from 'vitest';
import { IMPORT } from '../config.ts';
import { frameAt } from '../geo/frame.ts';
import { convertFeatures, stitchLines, type OsmCollection } from './convert.ts';

const CENTRE: [number, number] = [-95.99, 36.15];
const frame = frameAt(CENTRE, 48, 48, 0);

function square(lon: number, lat: number, half: number): [number, number][] {
  return [
    [lon - half, lat - half],
    [lon + half, lat - half],
    [lon + half, lat + half],
    [lon - half, lat + half],
    [lon - half, lat - half],
  ];
}

const collection: OsmCollection = {
  features: [
    {
      id: 'way/1',
      properties: { natural: 'water' },
      geometry: {
        type: 'Polygon',
        coordinates: [square(CENTRE[0], CENTRE[1], 0.05)],
      },
    },
    {
      id: 'way/2',
      properties: { natural: 'water' },
      geometry: {
        type: 'Polygon',
        coordinates: [square(CENTRE[0], CENTRE[1], 0.0002)],
      },
    },
    {
      id: 'relation/3',
      properties: { natural: 'water', type: 'multipolygon' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [square(CENTRE[0] - 0.2, CENTRE[1], 0.02)],
          [square(CENTRE[0] + 0.2, CENTRE[1], 0.02)],
        ],
      },
    },
    {
      id: 'way/4',
      properties: { leisure: 'park' },
      geometry: {
        type: 'Polygon',
        coordinates: [square(CENTRE[0], CENTRE[1] - 0.2, 0.05)],
      },
    },
    {
      id: 'way/5',
      properties: { waterway: 'river', width: '30' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [CENTRE[0] - 0.3, CENTRE[1] + 0.1],
          [CENTRE[0] + 0.3, CENTRE[1] + 0.1],
        ],
      },
    },
    {
      id: 'way/6',
      properties: { waterway: 'river', width: '900' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [CENTRE[0] - 0.3, CENTRE[1] - 0.1],
          [CENTRE[0] + 0.3, CENTRE[1] - 0.1],
        ],
      },
    },
    {
      id: 'way/7',
      properties: { highway: 'motorway' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [CENTRE[0] - 0.4, CENTRE[1] + 0.3],
          [CENTRE[0] + 0.4, CENTRE[1] + 0.3],
        ],
      },
    },
    {
      id: 'way/8',
      properties: { highway: 'residential' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [CENTRE[0], CENTRE[1]],
          [CENTRE[0] + 0.1, CENTRE[1]],
        ],
      },
    },
  ],
};

describe('convertFeatures', () => {
  const layers = convertFeatures(collection, frame);

  it('turns a water polygon into a smooth closed shape tagged osm', () => {
    const lake = layers.water.find((s) => s.id === 'way/1-0');
    expect(lake?.kind).toBe('closedSpline');
    expect(lake?.origin).toBe('osm');
    expect(lake?.points.length).toBeGreaterThanOrEqual(3);
    expect(lake?.points[0]?.handleOut).toBeDefined();
  });

  it('drops tiny polygons as noise', () => {
    expect(layers.water.some((s) => s.id.startsWith('way/2'))).toBe(false);
  });

  it('keeps every outer ring of a multipolygon', () => {
    expect(
      layers.water.filter((s) => s.id.startsWith('relation/3-')),
    ).toHaveLength(2);
  });

  it('puts parks in their own layer', () => {
    expect(layers.parks).toHaveLength(1);
    expect(layers.parks[0]?.id).toBe('way/4-0');
  });

  it('clamps river widths to the allowed range', () => {
    const thin = layers.water.find((s) => s.id === 'way/5-0');
    const wide = layers.water.find((s) => s.id === 'way/6-0');
    expect(thin?.kind).toBe('strokeSpline');
    expect(thin?.width).toBe(IMPORT.riverWidthMin);
    expect(wide?.width).toBe(IMPORT.riverWidthMax);
  });

  it('turns motorways into guide lines and leaves other roads out', () => {
    expect(layers.motorwayGuide.map((p) => p.id)).toEqual(['way/7-0']);
    expect(layers.motorwayGuide[0]?.points.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps a feature that lies inside the frame inside the grid', () => {
    const lake = layers.water.find((s) => s.id === 'way/1-0');
    expect(lake).toBeDefined();
    for (const p of lake?.points ?? []) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(frame.cols);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(frame.rows);
    }
  });
});

describe('stitchLines', () => {
  it('joins lines that meet end to end, in either direction', () => {
    const joined = stitchLines([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [3, 0],
      ],
    ]);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toHaveLength(4);
  });

  it('keeps lines that do not meet apart', () => {
    expect(
      stitchLines([
        [
          [0, 0],
          [1, 0],
        ],
        [
          [5, 5],
          [6, 5],
        ],
      ]),
    ).toHaveLength(2);
  });
});
