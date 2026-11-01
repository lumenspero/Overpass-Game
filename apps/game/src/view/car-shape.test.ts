import { describe, expect, it } from 'vitest';
import {
  CAR_LENGTH_PER_WIDTH,
  carOutline,
  headingBetween,
} from './car-shape.ts';

describe('carOutline', () => {
  const width = 10;
  const length = width * CAR_LENGTH_PER_WIDTH;

  it('spans the car length along its heading and its width across it', () => {
    const pts = carOutline({ x: 0, y: 0 }, 0, width);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(length, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(width, 6);
  });

  it('turns with the heading, so a car facing down the screen is long vertically', () => {
    const pts = carOutline({ x: 0, y: 0 }, Math.PI / 2, width);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(length, 6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(width, 6);
  });

  it('is centred on the given point', () => {
    const pts = carOutline({ x: 40, y: 25 }, 0.7, width);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    expect(cx).toBeCloseTo(40, 6);
    expect(cy).toBeCloseTo(25, 6);
  });
});

describe('headingBetween', () => {
  it('gives the angle from one point to another', () => {
    expect(headingBetween({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
    expect(headingBetween({ x: 0, y: 0 }, { x: 0, y: 2 })).toBeCloseTo(
      Math.PI / 2,
    );
  });

  it('gives null for the same point, so a parked car keeps its last heading', () => {
    expect(headingBetween({ x: 3, y: 3 }, { x: 3, y: 3 })).toBeNull();
  });
});
