import { METRES_PER_TILE } from '../config.ts';
import { rotateVector, type Frame } from '../geo/frame.ts';
import { lonLatToMercator, type LonLat } from '../geo/mercator.ts';

/** A point in grid units: origin at the top-left, x east, y south, one unit per tile. */
export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

/** Maps longitude and latitude into a frame's grid, undoing the frame's turn. */
export function projectToGrid(frame: Frame): (p: LonLat) => GridPoint {
  return ([lon, lat]) => {
    const [mx, my] = lonLatToMercator([lon, lat]);
    const [u, v] = rotateVector(
      [mx - frame.centre[0], my - frame.centre[1]],
      -frame.rotationDeg,
    );
    return {
      x: frame.cols / 2 + u / METRES_PER_TILE,
      y: frame.rows / 2 - v / METRES_PER_TILE,
    };
  };
}
