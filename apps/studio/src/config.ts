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

/** Terrarium elevation tiles are read at this zoom: about 150 m of ground per pixel at the equator. */
export const TERRAIN_ZOOM = 10;

/** Starting view for the map: the middle of the continental United States. */
export const DEFAULT_VIEW = { centre: [-98.58, 39.83], zoom: 3.4 } as const;

/** Keyless OpenFreeMap style for the real-map panel. */
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Nominatim allows one request per second. A little margin keeps us under it. */
export const NOMINATIM_MIN_INTERVAL_MS = 1100;

/**
 * OSM import tuning, in tiles. These decide how much detail survives the import. They are
 * authoring choices, not gameplay numbers, so they stay here.
 */
export const IMPORT = {
  /** Douglas-Peucker tolerance: shapes keep points that deviate more than this. */
  simplifyTolerance: 0.05,
  /** Closed shapes smaller than this area are dropped as noise. */
  minClosedArea: 1,
  /** Strokes shorter than this length are dropped as noise. */
  minStrokeLength: 0.5,
  /** River and canal widths are clamped to this range. */
  riverWidthMin: 0.25,
  riverWidthMax: 1,
  /** Used when a waterway has no usable width tag. */
  riverWidthDefault: 0.3,
  /** Coastlines are drawn as strokes this wide. */
  coastWidth: 0.25,
  /** The mountain slider starts here, in metres, and runs from min to max in steps. */
  mountainThresholdDefault: 500,
  mountainThresholdMin: 0,
  mountainThresholdMax: 3000,
  mountainThresholdStep: 25,
} as const;
