// Input feel constants. These shape how gestures are read, not game rules,
// so they live with the input layer rather than in packages/sim/src/config.ts.

/** Screen pixels a touch may drift before it counts as a drag. */
export const TOUCH_SLOP_PX = 10;

/** Hold time before a still touch turns into an erase stroke. */
export const LONG_PRESS_MS = 450;

/**
 * How close, in tiles, the pointer must be to a tile's centre before a stroke takes that
 * tile. Passing a corner brushes the neighbouring tiles only near their edges, so they
 * are skipped. A press still takes the tile under it straight away. The radius is a
 * circle, so it stays clear of the diagonal neighbours' tiles.
 */
export const STROKE_SETTLE_TILES = 0.25;

/** Wheel zoom: factor = exp(-deltaY * WHEEL_ZOOM_RATE). One notch (100) is about 1.13x. */
export const WHEEL_ZOOM_RATE = 0.0012;
