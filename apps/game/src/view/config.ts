// Camera feel constants. Presentation only, not game rules.

/** Screen pixels kept clear around the map when it is fitted to the screen. */
export const FIT_PADDING_PX = 24;

/** Furthest zoom-out, as a fraction of the fitted zoom. Below 1 shows a margin around the map. */
export const MIN_ZOOM_OF_FIT = 0.8;

/** Closest zoom-in: one tile may grow to this many screen pixels. */
export const MAX_TILE_SCREEN_PX = 120;
