import { TILE_SIZE } from '@overpass-game/render-style';
import {
  type Building,
  buildingCentre,
  createGrid,
  type Demand,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import {
  BIG_PIN_HEAD,
  demandPins,
  PIN_SLOTS,
  PIN_TIP,
  pinFillPolygon,
  pinOutline,
  pinSlot,
} from './demand-pins.ts';

const grid = createGrid(10, 10);
const colors = [0xff0000, 0x00ff00, 0x0000ff];
const business = (shape: 'square' | 'round'): Building => ({
  id: 0,
  kind: 'destination',
  color: 2,
  tile: 4 * 10 + 4,
  entrance: 'n',
  shape,
});
const demandOf = (pins: number, overflowFill = 0): Record<number, Demand> => ({
  0: { pins, cooldown: 10, overflowFill, growth: 0 },
});

describe('demandPins', () => {
  it('shows one small pin per waiting request, in the business colour, up to nine', () => {
    const few = demandPins([business('square')], demandOf(4), grid, colors);
    expect(few.small).toHaveLength(4);
    expect(few.big).toEqual([]);
    for (const p of few.small) expect(p.color).toBe(colors[2]);
    const many = demandPins([business('square')], demandOf(12), grid, colors);
    expect(many.small).toHaveLength(PIN_SLOTS);
  });

  it('lays a square business out as a 3 by 3 grid, row by row', () => {
    const slots = Array.from({ length: 9 }, (_, i) => pinSlot('square', i));
    expect(new Set(slots.map((s) => s.x.toFixed(3))).size).toBe(3);
    expect(new Set(slots.map((s) => s.y.toFixed(3))).size).toBe(3);
    // Row by row from the top left.
    expect(slots[0]?.x).toBeLessThan(slots[1]?.x ?? 0);
    expect(slots[2]?.y).toBeLessThan(slots[3]?.y ?? 0);
  });

  it('lays a round business out as a clock face, clockwise from 12', () => {
    const slots = Array.from({ length: 9 }, (_, i) => pinSlot('round', i));
    const top = slots[0];
    if (!top) throw new Error('no slot');
    expect(top.x).toBeCloseTo(0);
    // Every head is the same distance from the ring's centre, a little above the building's centre.
    const lift = slots.reduce((sum, s) => sum + s.y, 0) / slots.length;
    const radii = slots.map((s) => Math.hypot(s.x, s.y - lift));
    for (const r of radii) expect(r).toBeCloseTo(radii[0] ?? 0, 6);
    // The next one is to the right of 12, as a clock runs.
    expect(slots[1]?.x).toBeGreaterThan(0);
  });

  it('shows one large pin over the building in place of the small ones while it overflows', () => {
    const b = business('round');
    const out = demandPins([b], demandOf(9, 0.4), grid, colors);
    expect(out.small).toEqual([]);
    expect(out.big).toHaveLength(1);
    const c = buildingCentre(grid, b);
    expect(out.big[0]?.x).toBeCloseTo(c.x * TILE_SIZE);
    expect(out.big[0]?.y).toBeLessThan(c.y * TILE_SIZE);
    expect(out.big[0]?.fill).toBe(0.4);
  });

  it('reads a business saved before the overflow pin existed as not overflowing', () => {
    const d = demandOf(3);
    delete d[0]?.overflowFill;
    const out = demandPins([business('square')], d, grid, colors);
    expect(out.small).toHaveLength(3);
    expect(out.big).toEqual([]);
  });

  it('draws nothing for houses', () => {
    const house: Building = {
      id: 0,
      kind: 'house',
      color: 0,
      tile: 3,
      entrance: 'e',
    };
    expect(demandPins([house], demandOf(5), grid, colors)).toEqual({
      small: [],
      big: [],
    });
  });
});

describe('pin shapes', () => {
  it('has a round head with a tip below it', () => {
    const outline = pinOutline(100, 100, 10);
    expect(outline[0]).toEqual({ x: 100, y: 100 + 10 * PIN_TIP });
    const top = Math.min(...outline.map((p) => p.y));
    expect(top).toBeCloseTo(90, 1);
  });

  it('fills counterclockwise from the top', () => {
    expect(pinFillPolygon(0, 0, BIG_PIN_HEAD, 0)).toEqual([]);
    // A quarter fills the upper left: counterclockwise on screen from straight up.
    const quarter = pinFillPolygon(0, 0, 10, 0.25);
    for (const p of quarter) {
      expect(p.x).toBeLessThanOrEqual(1e-6);
      expect(p.y).toBeLessThanOrEqual(1e-6);
    }
    // Full is the whole pin, tip included.
    const full = pinFillPolygon(0, 0, 10, 1);
    expect(Math.max(...full.map((p) => p.y))).toBeCloseTo(10 * PIN_TIP, 6);
  });

  it('reaches the tip when more than half full', () => {
    const most = pinFillPolygon(0, 0, 10, 0.6);
    expect(Math.max(...most.map((p) => p.y))).toBeCloseTo(10 * PIN_TIP, 1);
  });
});
