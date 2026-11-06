// Map Studio authoring settings. They shape the map frame and the tools, not
// gameplay, so they live here rather than in packages/sim/src/config.ts.

/** Web Mercator metres per grid tile. A quarter of the old 1000, so the 96-tile grid covers the real-map panel's 24 km view. Mercator stretches north-south distances by about 1.3x at 40°N (see docs/decisions.md). */
export const METRES_PER_TILE = 250;

/** Frame size limits, in tiles per side. */
export const MIN_FRAME_TILES = 16;
export const MAX_FRAME_TILES = 192;
/** Twice the old 48 per side, at a quarter of the metres per tile: the frame covers 24 km. */
export const DEFAULT_FRAME_TILES = 96;

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
 * authoring choices, not gameplay numbers, so they stay here. A tile is now 250 m (was 1000 m),
 * so each tile-based value is quadrupled to keep the same ground size as before.
 */
export const IMPORT = {
  /** Douglas-Peucker tolerance: shapes keep points that deviate more than this. */
  simplifyTolerance: 0.2,
  /**
   * Share of each shape's points kept by outline smoothing (0 to 1). Below 1, outlines are smoothed
   * first, so stair-stepped mountains and ragged banks become clean curves. 0.6 was picked on the
   * Pierre, Los Angeles and Tulsa mock-ups.
   */
  shapeDetail: 0.6,
  /** How far, in tiles, smoothing reaches at the lowest detail. It scales down as detail rises. */
  smoothReachMax: 3,
  /** Closed shapes smaller than this area are dropped as noise. */
  minClosedArea: 16,
  /** Strokes shorter than this length are dropped as noise. */
  minStrokeLength: 2,
  /** River and canal widths are clamped to this range. */
  riverWidthMin: 1,
  riverWidthMax: 4,
  /** Used when a waterway has no usable width tag. */
  riverWidthDefault: 1.2,
  /** Coastlines are drawn as strokes this wide. */
  coastWidth: 1,
  /** The mountain slider starts here, in metres, and runs from min to max in steps. */
  mountainThresholdDefault: 500,
  mountainThresholdMin: 0,
  mountainThresholdMax: 3000,
  mountainThresholdStep: 25,
} as const;

/** Editor settings: snapping, undo depth, and drawn and hit sizes. Authoring choices, not gameplay numbers. */
export const EDIT = {
  /** Points snap to multiples of this many tiles. */
  snapStep: 0.25,
  /** Undo steps kept in memory. */
  historyLimit: 200,
  /** How close the pointer must be to an anchor, handle or edge to grab it, in screen pixels. */
  hitRadiusPx: 8,
  /** Drawn size of an anchor square, in screen pixels. */
  anchorPx: 7,
  /** Drawn diameter of a handle dot, in screen pixels. */
  handlePx: 5,
  /** Width of the bold outline drawn around each shape, in screen pixels. */
  outlinePx: 2,
  /** The preview zooms between these factors. */
  viewZoomMin: 0.5,
  viewZoomMax: 40,
} as const;

/** How long the work must be still before a draft is saved, in milliseconds. */
export const AUTOSAVE_MS = 1000;
