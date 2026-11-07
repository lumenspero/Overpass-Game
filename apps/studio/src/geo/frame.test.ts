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
  isInsideUS,
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

describe('isInsideUS', () => {
  it('accepts a frame in the middle of the country', () => {
    expect(isInsideUS(frameAt(TULSA, 48, 48, 0))).toBe(true);
  });

  it('rejects a frame south of the border (Chiapas, Mexico)', () => {
    expect(isInsideUS(frameAt([-92.6, 15.5], 48, 48, 0))).toBe(false);
  });

  it('is a bounding-box check, so Toronto passes: the box does not trace the coast', () => {
    expect(isInsideUS(frameAt([-79.38, 43.65], 48, 48, 0))).toBe(true);
  });

  it('accepts Alaska (Anchorage) and Hawaii (Honolulu)', () => {
    expect(isInsideUS(frameAt([-149.9, 61.2], 48, 48, 0))).toBe(true);
    expect(isInsideUS(frameAt([-157.86, 21.31], 48, 48, 0))).toBe(true);
  });

  it('rejects a frame that crosses the western edge', () => {
    expect(isInsideUS(frameAt([-179.15, 60], 96, 96, 0))).toBe(false);
  });

  it('is judged on the rotated corners, not the unturned frame', () => {
    // The box's east edge is at -66.85°. Centred at -67.1°, a 192-tile frame (48 km at 250 m a tile)
    // unturned has its east edge at about -66.88°, inside the box; turned 45°, a corner reaches about -66.80°.
    expect(isInsideUS(frameAt([-67.1, 40], 192, 192, 0))).toBe(true);
    expect(isInsideUS(frameAt([-67.1, 40], 192, 192, 45))).toBe(false);
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
