/** The shape the preview needs: a turned rectangle of tiles. */
export interface PreviewShape {
  readonly cols: number;
  readonly rows: number;
  readonly rotationDeg: number;
}

/** Canvas transform from tile-local coordinates (u east, v north, origin at the centre) to CSS pixels, y down. */
export interface PreviewLayout {
  readonly scale: number;
  readonly matrix: {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;
  };
}

/**
 * Fits the turned frame into a canvas with a margin. North stays up on
 * screen, as on the real map, so a turn of +90° moves the frame's north
 * edge to the west.
 */
export function previewLayout(
  shape: PreviewShape,
  width: number,
  height: number,
  padTiles = 2,
): PreviewLayout {
  const t = (shape.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const halfW =
    (shape.cols / 2) * Math.abs(cos) + (shape.rows / 2) * Math.abs(sin);
  const halfH =
    (shape.cols / 2) * Math.abs(sin) + (shape.rows / 2) * Math.abs(cos);
  const fitW = width / (2 * halfW + 2 * padTiles);
  const fitH = height / (2 * halfH + 2 * padTiles);
  const scale = Math.max(0, Math.min(fitW, fitH));
  // X = a*u + c*v + e and Y = b*u + d*v + f, with v flipped so north is up.
  return {
    scale,
    matrix: {
      a: scale * cos,
      b: -scale * sin,
      c: -scale * sin,
      d: -scale * cos,
      e: width / 2,
      f: height / 2,
    },
  };
}
