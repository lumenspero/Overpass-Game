// @overpass-game/render-style — palettes, sizes and shared drawing helpers.
export const PACKAGE_NAME = '@overpass-game/render-style' as const;

/** World units per grid tile. At camera zoom 1, one world unit is one CSS pixel. */
export const TILE_SIZE = 32;

/** Road width as a fraction of one tile. Rounded ends give joins and corners. */
export const ROAD_WIDTH_TILES = 0.5;

/** Flat placeholder palette for the M2 test view. Final palettes arrive in M9. */
export const PALETTE = {
  background: 0x111111,
  land: 0x23282e,
  water: 0x2c4f6e,
  mountain: 0x59606a,
  park: 0x2f4a34,
  road: 0xe8e4d8,
} as const;

/** Colours for the debug overlay only. Never shown to players. */
export const DEBUG_PALETTE = {
  grid: 0x3a4048,
  edge: 0x7fd1ff,
  node: 0xffb454,
} as const;
