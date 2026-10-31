// Map Studio authoring settings. They shape the map frame and the tools, not
// gameplay, so they live here rather than in packages/sim/src/config.ts.

/** Web Mercator metres per grid tile. Mercator stretches north-south distances by about 1.3x at 40°N (see docs/decisions.md). */
export const METRES_PER_TILE = 1000;

/** Frame size limits, in tiles per side. */
export const MIN_FRAME_TILES = 16;
export const MAX_FRAME_TILES = 96;
export const DEFAULT_FRAME_TILES = 48;

/** Continental United States bounding box as [west, south, east, north] in degrees. Frames must lie inside it. */
export const CONTINENTAL_US_BBOX = [-124.85, 24.4, -66.85, 49.45] as const;

/** Starting view for the map: the middle of the continental United States. */
export const DEFAULT_VIEW = { centre: [-98.58, 39.83], zoom: 3.4 } as const;

/** Keyless OpenFreeMap style for the real-map panel. */
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Nominatim allows one request per second. A little margin keeps us under it. */
export const NOMINATIM_MIN_INTERVAL_MS = 1100;
