import type { Shape, SourceMap } from '@overpass-game/map-schema';
import { describe, expect, it } from 'vitest';
import { smoothShapes, smoothSource } from './smooth.ts';

type P = { x: number; y: number };

/** A 10 by 6 block traced as stairs: one point per tile step, like a mountain from the elevation grid. */
function stairs(): P[] {
  const pts: P[] = [];
  for (let x = 0; x < 10; x++)
    pts.push({ x, y: 0 }, { x: x + 0.5, y: x % 2 ? 0.5 : 0 });
  for (let y = 0; y < 6; y++) pts.push({ x: 10, y });
  for (let x = 10; x > 0; x--) pts.push({ x, y: 6 });
  for (let y = 6; y > 0; y--) pts.push({ x: 0, y });
  return pts;
}

const closed = (id: string, points: P[]): Shape => ({
  id,
  kind: 'closedSpline',
  origin: 'osm',
  points,
});

function area(pts: readonly P[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

describe('outline smoothing', () => {
  it('keeps 60% of a stair-stepped outline and close to its area, with curve handles', () => {
    const src = stairs();
    const [out] = smoothShapes([closed('m', src)], 0.6);
    expect(out!.points).toHaveLength(Math.round(src.length * 0.6));
    expect(Math.abs(area(out!.points) - area(src)) / area(src)).toBeLessThan(
      0.08,
    );
    expect(out!.points.every((p) => p.handleIn && p.handleOut)).toBe(true);
  });

  it('leaves small, locked and full-detail shapes as they are', () => {
    const tiny = closed('t', stairs().slice(0, 6));
    const locked = { ...closed('l', stairs()), locked: true };
    expect(smoothShapes([tiny, locked], 0.6)).toEqual([tiny, locked]);
    const full = closed('f', stairs());
    expect(smoothShapes([full], 1)).toEqual([full]);
  });

  it('leaves a painted shape as the author drew it', () => {
    const painted: Shape = { ...closed('p', stairs()), origin: 'painted' };
    expect(smoothShapes([painted], 0.6)).toEqual([painted]);
  });

  it('keeps a river stroke on its two ends', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({
      x: i,
      y: i % 2 ? 0.4 : 0,
    }));
    const river: Shape = {
      id: 'r',
      kind: 'strokeSpline',
      origin: 'osm',
      width: 1,
      points,
    };
    const [out] = smoothShapes([river], 0.6);
    expect(out!.points[0]).toMatchObject({ x: 0, y: 0 });
    expect(out!.points[out!.points.length - 1]).toMatchObject({
      x: 29,
      y: 0.4,
    });
  });

  it('holds the points two shapes share, with straight joins, so their edges stay together', () => {
    const edge = Array.from({ length: 9 }, (_, i) => ({ x: 10, y: i }));
    const left = closed('left', [
      ...Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 })),
      ...edge,
      ...Array.from({ length: 10 }, (_, i) => ({ x: 9 - i, y: 8 })),
    ]);
    const right = closed('right', [
      ...[...edge].reverse(),
      ...Array.from({ length: 10 }, (_, i) => ({ x: 11 + i, y: 8 - (i % 2) })),
    ]);
    const [l, r] = smoothShapes([left, right], 0.6);
    for (const p of edge) {
      for (const shape of [l!, r!]) {
        const hit = shape.points.find((q) => q.x === p.x && q.y === p.y);
        expect(hit).toBeDefined();
        expect(hit?.handleIn).toBeUndefined();
      }
    }
  });

  it('smooths water, mountains and parks across a whole map', () => {
    const map = {
      layers: {
        water: [closed('w', stairs())],
        mountains: [closed('m', stairs())],
        parks: [closed('p', stairs())],
        motorwayGuide: [],
        starterRoads: [],
        labels: [],
      },
    } as unknown as SourceMap;
    const out = smoothSource(map, 0.6);
    for (const layer of ['water', 'mountains', 'parks'] as const) {
      expect(out.layers[layer][0]!.points.length).toBeLessThan(stairs().length);
    }
  });
});
