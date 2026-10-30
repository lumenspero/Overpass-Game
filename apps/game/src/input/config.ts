// Input feel constants. These shape how gestures are read, not game rules,
// so they live with the input layer rather than in packages/sim/src/config.ts.

/** Screen pixels a touch may drift before it counts as a drag. */
export const TOUCH_SLOP_PX = 10;

/** Hold time before a still touch turns into an erase stroke. */
export const LONG_PRESS_MS = 450;

/** Wheel zoom: factor = exp(-deltaY * WHEEL_ZOOM_RATE). One notch (100) is about 1.13x. */
export const WHEEL_ZOOM_RATE = 0.0012;
