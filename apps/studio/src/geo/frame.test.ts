import { describe, expect, it } from 'vitest';
import {
  METRES_PER_TILE,
  MAX_FRAME_TILES,
  MIN_FRAME_TILES,
} from '../config.ts';
import { lonLatToMercator } from './mercator.ts';
import {
  frameAt,
  frameBBox,
  frameCornersMercator,
  frameFromDrag,
  isInsideContinentalUS,
  normaliseRotation,
  withRotation,
} from './frame.ts';

const TULSA: [number, number] = [-95.99, 36.15];

describe('normaliseRotation', () => {
  it('wraps angles into (-180, 180]', () => {
    expect(normaliseRotation(45)).toBe(45);
    expect(normaliseRotation(270)).toBe(-90);
    expect(normaliseRotation(-270)).toBe(90);
    expect(normaliseRotation(180)).toBe(180);
    expect(normaliseRotation(-180)).toBe(180);
  });
});

describe('frameCornersMercator', () => {
  it('lists unrotated corners south-west first, counter-clockwise', () => {
    const frame = frameAt(TULSA, 20, 40, 0);
    const [sw, se, ne, nw] = frameCornersMercator(frame);
    expect(sw[0]).toBeLessThan(se[0]);
    expect(sw[1]).toBeLessThan(nw[1]);
    expect(ne[0]).toBeCloseTo(se[0], 6);
    expect(nw[0]).toBeCloseTo(sw[0], 6);
  });

  it('turns counter-clockwise: a 90° turn moves the north-east corner to the north-west', () => {
    const cols = 20;
    const rows = 40;
    const unrotated = frameCornersMercator(frameAt(TULSA, cols, rows, 0));
    const turned = frameCornersMercator(frameAt(TULSA, cols, rows, 90));
    const centre = lonLatToMercator(TULSA);
    // In the unrotated frame NE sits at (+halfW, +halfH). After 90° CCW it sits at (-halfH, +halfW).
    const ne = unrotated[2];
    const turnedNE = turned[2];
    expect(turnedNE[0] - centre[0]).toBeCloseTo(
      -(rows * METRES_PER_TILE) / 2,
      0,
    );
    expect(turnedNE[1] - centre[1]).toBeCloseTo(
      (cols * METRES_PER_TILE) / 2,
      0,
    );
    expect(ne[0] - centre[0]).toBeCloseTo((cols * METRES_PER_TILE) / 2, 0);
  });
});

describe('frameBBox', () => {
  it('contains the centre and matches the frame size in metres', () => {
    const frame = frameAt(TULSA, 48, 48, 0);
    const [w, s, e, n] = frameBBox(frame);
    expect(w).toBeLessThan(TULSA[0]);
    expect(e).toBeGreaterThan(TULSA[0]);
    expect(s).toBeLessThan(TULSA[1]);
    expect(n).toBeGreaterThan(TULSA[1]);
  });
});

describe('isInsideContinentalUS', () => {
  it('accepts a frame in the middle of the country', () => {
    expect(isInsideContinentalUS(frameAt(TULSA, 48, 48, 0))).toBe(true);
  });

  it('rejects a frame north of the border (Winnipeg)', () => {
    expect(isInsideContinentalUS(frameAt([-97.14, 49.9], 48, 48, 0))).toBe(
      false,
    );
  });

  it('is a bounding-box check, so Toronto passes: the box does not trace the coast', () => {
    expect(isInsideContinentalUS(frameAt([-79.38, 43.65], 48, 48, 0))).toBe(
      true,
    );
  });

  it('rejects Alaska', () => {
    expect(isInsideContinentalUS(frameAt([-149.9, 61.2], 48, 48, 0))).toBe(
      false,
    );
  });

  it('rejects a frame that crosses the western edge', () => {
    expect(isInsideContinentalUS(frameAt([-124.9, 40], 96, 96, 0))).toBe(false);
  });

  it('is judged on the rotated corners, not the unturned frame', () => {
    // At 40°N a 96-tile frame's half-width is about 0.43° of longitude. Unturned, its east edge
    // stays inside the box; turned 45°, the corners reach about 0.61° out and pass the edge.
    expect(isInsideContinentalUS(frameAt([-67.37, 40], 96, 96, 0))).toBe(true);
    expect(isInsideContinentalUS(frameAt([-67.37, 40], 96, 96, 45))).toBe(
      false,
    );
  });
});

describe('frameFromDrag', () => {
  it('sizes the frame from the drag in tiles', () => {
    const a = lonLatToMercator(TULSA);
    const b: [number, number] = [
      a[0] + 50 * METRES_PER_TILE,
      a[1] + 30 * METRES_PER_TILE,
    ];
    const frame = frameFromDrag(a, b, 15);
    expect(frame.cols).toBe(50);
    expect(frame.rows).toBe(30);
    expect(frame.rotationDeg).toBe(15);
    expect(frame.centre[0]).toBeCloseTo(a[0] + 25 * METRES_PER_TILE, 6);
  });

  it('clamps tiny and huge drags to the limits', () => {
    const a = lonLatToMercator(TULSA);
    const tiny = frameFromDrag(a, [a[0] + 1000, a[1] + 1000], 0);
    expect(tiny.cols).toBe(MIN_FRAME_TILES);
    const huge = frameFromDrag(
      a,
      [a[0] + 500 * METRES_PER_TILE, a[1] + 500 * METRES_PER_TILE],
      0,
    );
    expect(huge.rows).toBe(MAX_FRAME_TILES);
  });
});

describe('withRotation', () => {
  it('keeps size and centre and normalises the angle', () => {
    const frame = withRotation(frameAt(TULSA, 40, 30, 0), 300);
    expect(frame.cols).toBe(40);
    expect(frame.rows).toBe(30);
    expect(frame.rotationDeg).toBe(-60);
  });
});
