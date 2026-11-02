// @overpass-game/render-style — palettes, sizes and shared drawing helpers.
export const PACKAGE_NAME = '@overpass-game/render-style' as const;

/** World units per grid tile. At camera zoom 1, one world unit is one CSS pixel. */
export const TILE_SIZE = 32;

/** Road width as a fraction of one tile. Rounded ends give joins and corners. */
export const ROAD_WIDTH_TILES = 0.5;

/** Light or dark presentation. Chosen by the player. */
export type ThemeMode = 'light' | 'dark';

/** Every colour a map palette sets. All values are 24-bit hex numbers. */
export interface MapPalette {
  /** Canvas clear colour behind the map. Not yet specified; placeholder. */
  readonly background: number;
  /** Main terrain ground, from the selected terrain family. */
  readonly land: number;
  /** Terrain variety: three nearby tints so zones are not one flat colour. */
  readonly landTints: readonly number[];
  /** Mountain body: the complement of the terrain hue, darker and bolder. */
  readonly mountain: number;
  /** Shaded side and higher tier of a mountain. */
  readonly mountainShade: number;
  /** Parks: a muted alternate of the terrain hue. */
  readonly park: number;
  /** Thin border around mountain regions: the mountain colour from the opposite mode. */
  readonly mountainEdge: number;
  /** Thin border around park regions: the park colour from the opposite mode. */
  readonly parkEdge: number;
  /** Main water colour: the middle step of the water ramp. */
  readonly water: number;
  /** Thin border around water: the main water colour from the opposite mode. */
  readonly waterEdge: number;
  /** Shared water ramp, greenish-blue to light purple, nine steps. */
  readonly waterRamp: readonly number[];
  /** Pavement fill (approved accent). */
  readonly road: number;
  /** Pavement outline (approved accent). */
  readonly kerb: number;
  /** Motorway fill (approved accent). */
  readonly motorway: number;
  /** Stroke around motorways (approved accent). */
  readonly motorwayContrast: number;
  /** Motorway shield badge (approved accent). */
  readonly motorwayBadge: number;
  /** Darker shade of the terrain colour, used under buildings and roads. */
  readonly shadow: number;
  /** Faint motorway guide overlay. Not yet specified; reuses the accent greys. */
  readonly guide: number;
}

/** A building colour: top face and shaded side. The shadow comes from the terrain. */
export interface BuildingStyle {
  readonly face: number;
  readonly side: number;
}

/** Terrain families a map can be assigned: ROYGBIV, white and black. */
export const BASE_PALETTE_IDS = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'indigo',
  'violet',
  'white',
  'black',
] as const;
export type BasePaletteId = (typeof BASE_PALETTE_IDS)[number];

/** Hue (degrees), saturation and lightness, each 0 to 1 for the last two. */
type Hsl = readonly [number, number, number];

/**
 * Light-mode terrain ground for each family. Pastels, hue-shifted and lower in
 * saturation than the building faces, so terrain and buildings stay apart.
 */
const TERRAIN_LIGHT: Readonly<Record<BasePaletteId, Hsl>> = {
  red: [6, 0.55, 0.86],
  orange: [24, 0.6, 0.85],
  yellow: [52, 0.65, 0.86],
  green: [112, 0.4, 0.82],
  blue: [212, 0.5, 0.84],
  indigo: [240, 0.4, 0.84],
  violet: [285, 0.4, 0.85],
  white: [40, 0.12, 0.93],
  black: [220, 0.05, 0.62],
};

/** Approved accents, light and dark. Shared by every terrain family. */
const ACCENTS = {
  light: {
    road: 0xe8e4d8,
    // Guide #9aa7b8 at 30 percent alpha over the light background #f4efe4.
    kerb: 0xd9d9d7,
    motorway: 0x9aa7b8,
    motorwayContrast: 0x9aa7b8,
    motorwayBadge: 0x9aa7b8,
    guide: 0x9aa7b8,
  },
  dark: {
    road: 0x4a5262,
    kerb: 0x6b7486,
    motorway: 0x4a5262,
    motorwayContrast: 0xf2f2f2,
    motorwayBadge: 0xf2b84b,
    guide: 0x8a93a6,
  },
} as const;

/** Background placeholders, not yet specified. */
const BACKGROUND = { light: 0xf4efe4, dark: 0x1d222b } as const;

function hslToHex([h, s, l]: Hsl): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];
  const to8 = (v: number): number => Math.round((v + m) * 255);
  return (to8(r) << 16) | (to8(g) << 8) | to8(b);
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

/** Dark-mode version of a terrain colour: same hue, roughly half the lightness. */
const darkTerrain = ([h, s, l]: Hsl): Hsl => [
  h,
  clamp01(s * 0.85),
  clamp01(l * 0.5),
];

/** Hue, saturation and lightness of a 24-bit colour. */
function hexToHsl(hex: number): Hsl {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [wrapHue(h * 60), s, l];
}

/** Ground and its shadow for one mode. Approved values, unchanged. */
interface TerrainCore {
  readonly land: number;
  readonly landTints: readonly number[];
  readonly shadow: number;
}

/** Light-mode ground set for one family. */
function terrainLight(land: Hsl): TerrainCore {
  const [h, s, l] = land;
  return {
    land: hslToHex(land),
    landTints: [
      hslToHex([wrapHue(h - 14), s, clamp01(l + 0.03)]),
      hslToHex([wrapHue(h + 14), s, clamp01(l - 0.02)]),
      hslToHex([wrapHue(h + 6), clamp01(s + 0.05), l]),
    ],
    shadow: hslToHex([h, s, clamp01(l * 0.72)]),
  };
}

/** Dark-mode ground set for one family: each light colour is passed through darkTerrain. */
function terrainDark(land: Hsl): TerrainCore {
  const [h, s, l] = land;
  const d = (c: Hsl): number => hslToHex(darkTerrain(c));
  return {
    land: d(land),
    landTints: [
      d([wrapHue(h - 14), s, clamp01(l + 0.03)]),
      d([wrapHue(h + 14), s, clamp01(l - 0.02)]),
      d([wrapHue(h + 6), clamp01(s + 0.05), l]),
    ],
    shadow: hslToHex([h, s, clamp01(l * 0.36)]),
  };
}

/**
 * Mountain and park colours, both in the same hue as the ground they sit on.
 * Mountains are a darker, bolder alternate; parks are a muted, slightly darker
 * alternate. Both are derived from the approved ground colour in the same mode.
 */
function regionsFor(ground: number): {
  mountain: number;
  mountainShade: number;
  park: number;
} {
  const [h, s, l] = hexToHsl(ground);
  return {
    mountain: hslToHex([h, clamp01(s + 0.1), clamp01(l * 0.6)]),
    mountainShade: hslToHex([h, clamp01(s + 0.1), clamp01(l * 0.45)]),
    park: hslToHex([h, s * 0.7, clamp01(l * 0.85)]),
  };
}

/**
 * Water ramp: nine steps from greenish-blue (hue 165) to light purple (hue 275),
 * pastel. Dark mode steps down in lightness slightly.
 */
/**
 * A nine-step water ramp starting at `startHue` and turning 110° from there. The shared ramp
 * starts at 165 (greenish-blue) and ends near 275 (light purple).
 */
function waterRamp(startHue: number, lightness: number): readonly number[] {
  return Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return hslToHex([startHue + 110 * t, 0.42, lightness + 0.06 * t]);
  });
}
const SHARED_WATER_HUE = 165;
export const WATER_RAMP_LIGHT: readonly number[] = waterRamp(
  SHARED_WATER_HUE,
  0.78,
);
export const WATER_RAMP_DARK: readonly number[] = waterRamp(
  SHARED_WATER_HUE,
  0.68,
);
/** Index of the main water colour in the ramp. */
const WATER_MAIN_INDEX = 4;

/**
 * Water choices a map can make. `shared` is the approved ramp every family uses by default. The
 * others start the ramp at their terrain family's hue. White and black have no hue, so they are
 * left out.
 */
export const WATER_PALETTE_IDS = [
  'shared',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'indigo',
  'violet',
] as const;
export type WaterPaletteId = (typeof WATER_PALETTE_IDS)[number];

export interface WaterSet {
  readonly water: number;
  readonly waterEdge: number;
  readonly waterRamp: readonly number[];
}

/** The water colours for one water choice in one mode, with the border from the opposite mode. */
export function waterSetFor(waterId: string, mode: ThemeMode): WaterSet {
  const family = (WATER_PALETTE_IDS as readonly string[]).includes(waterId)
    ? (waterId as WaterPaletteId)
    : 'shared';
  const hue =
    family === 'shared'
      ? SHARED_WATER_HUE
      : TERRAIN_LIGHT[family as BasePaletteId][0];
  const light = waterRamp(hue, 0.78);
  const dark = waterRamp(hue, 0.68);
  const ramp = mode === 'light' ? light : dark;
  const opposite = mode === 'light' ? dark : light;
  return {
    water: ramp[WATER_MAIN_INDEX] ?? 0,
    waterEdge: opposite[WATER_MAIN_INDEX] ?? 0,
    waterRamp: ramp,
  };
}

/** Both modes of one terrain family, with region borders taken from the opposite mode. */
function buildFamily(family: BasePaletteId): Record<ThemeMode, MapPalette> {
  const land = TERRAIN_LIGHT[family];
  const terrainL = terrainLight(land);
  const terrainD = terrainDark(land);
  const regL = regionsFor(terrainL.land);
  const regD = regionsFor(terrainD.land);
  const waterMainL = WATER_RAMP_LIGHT[WATER_MAIN_INDEX] ?? 0;
  const waterMainD = WATER_RAMP_DARK[WATER_MAIN_INDEX] ?? 0;
  return {
    light: {
      background: BACKGROUND.light,
      ...terrainL,
      mountain: regL.mountain,
      mountainShade: regL.mountainShade,
      park: regL.park,
      mountainEdge: regD.mountain,
      parkEdge: regD.park,
      water: waterMainL,
      waterEdge: waterMainD,
      waterRamp: WATER_RAMP_LIGHT,
      ...ACCENTS.light,
    },
    dark: {
      background: BACKGROUND.dark,
      ...terrainD,
      mountain: regD.mountain,
      mountainShade: regD.mountainShade,
      park: regD.park,
      mountainEdge: regL.mountain,
      parkEdge: regL.park,
      water: waterMainD,
      waterEdge: waterMainL,
      waterRamp: WATER_RAMP_DARK,
      ...ACCENTS.dark,
    },
  };
}

/** Every terrain family, in both modes. */
export const BASE_PALETTES: Readonly<
  Record<BasePaletteId | 'default', Readonly<Record<ThemeMode, MapPalette>>>
> = (() => {
  const out = {} as Record<
    BasePaletteId | 'default',
    Record<ThemeMode, MapPalette>
  >;
  for (const id of BASE_PALETTE_IDS) out[id] = buildFamily(id);
  // Existing maps use the id "default". It draws as the white family.
  out.default = out.white;
  return out;
})();

/**
 * Resolve a map's palette id, its water choice and the player's mode to concrete colours.
 * An unknown id falls back to `default` (white), so a bad or newer map still draws. An unknown
 * water choice falls back to the shared ramp.
 */
export function resolvePalette(
  paletteId: string,
  mode: ThemeMode,
  waterId: string = 'shared',
): MapPalette {
  const known = Object.hasOwn(BASE_PALETTES, paletteId);
  const family = known
    ? BASE_PALETTES[paletteId as BasePaletteId | 'default']
    : BASE_PALETTES.default;
  return { ...family[mode], ...waterSetFor(waterId, mode) };
}

/**
 * Colours for the current placeholder views. Kept as the default light palette
 * so existing imports keep drawing the same. Scene code moves to resolvePalette
 * when the theme toggle lands.
 */
export const PALETTE: MapPalette = BASE_PALETTES.default.light;

/**
 * Standard building palette: the same for every map and both modes, maintained
 * separately from terrain palettes. Each colour has a face and a shaded side.
 */
export const STANDARD_BUILDING_PALETTE: readonly BuildingStyle[] = [
  { face: 0xe8475c, side: 0xb8334a }, // red
  { face: 0xf7a53c, side: 0xd9742a }, // orange
  { face: 0x4a6fd8, side: 0x2f4ea8 }, // blue
  { face: 0x5fc7e6, side: 0x3a9bc0 }, // light blue
  { face: 0x5cc08a, side: 0x3a9466 }, // green
  { face: 0x9f7ae0, side: 0x7656b8 }, // purple
];

/** Building face colours, by index. Colour-blind symbols arrive in M10. */
export const BUILDING_COLORS: readonly number[] = STANDARD_BUILDING_PALETTE.map(
  (style) => style.face,
);

/** Colours for the debug overlay only. Never shown to players. */
export const DEBUG_PALETTE = {
  grid: 0x3a4048,
  edge: 0x7fd1ff,
  node: 0xffb454,
} as const;

/** Linear mix of two 24-bit colours, channel by channel. */
function mixChannels(from: number, to: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    out = (out << 8) | Math.round(a + (b - a) * t);
  }
  return out;
}

/** Linear-light value of one 0 to 1 sRGB channel. */
function linearChannel(v: number): number {
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a 24-bit colour. */
function relativeLuminance(c: number): number {
  return (
    0.2126 * linearChannel(((c >> 16) & 0xff) / 255) +
    0.7152 * linearChannel(((c >> 8) & 0xff) / 255) +
    0.0722 * linearChannel((c & 0xff) / 255)
  );
}

/** WCAG contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Kinds of region that carry a text label. */
export type LabelKind = 'park' | 'mountain' | 'water';

/** How far a label's starting hue is pulled toward its ground, so the label stays quiet. approximated. */
export const LABEL_GROUND_BLEND = 0.3;

/** Contrast a region label reaches against the land it sits on. Visible, but kept quiet. approximated: tune at Checkpoint D. */
export const LABEL_CONTRAST = 3;

/**
 * Moves a colour toward white or black until its relative luminance reaches `target`.
 * Mixing, not scaling, keeps the result from turning neon on dark ground.
 */
function colourAtLuminance(c: number, target: number): number {
  const pole = relativeLuminance(c) < target ? 0xffffff : 0x000000;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const lum = relativeLuminance(mixChannels(c, pole, mid));
    const reached = pole === 0xffffff ? lum >= target : lum <= target;
    if (reached) hi = mid;
    else lo = mid;
  }
  return mixChannels(c, pole, hi);
}

/**
 * Label colour for a region kind in one palette. It keeps the mid-tone hue of the region's
 * main and outline colours, and its lightness is set so the label reaches LABEL_CONTRAST
 * against the land: darker on light ground, lighter on dark ground.
 */
export function labelColour(palette: MapPalette, kind: LabelKind): number {
  const mid =
    kind === 'park'
      ? mixChannels(palette.park, palette.parkEdge, 0.5)
      : kind === 'mountain'
        ? mixChannels(palette.mountain, palette.mountainEdge, 0.5)
        : mixChannels(palette.water, palette.waterEdge, 0.5);
  const ground = relativeLuminance(palette.land);
  const target =
    ground > 0.18
      ? (ground + 0.05) / LABEL_CONTRAST - 0.05
      : LABEL_CONTRAST * (ground + 0.05) - 0.05;
  // Pull the hue part of the way toward the ground first, so the label stays quiet.
  return colourAtLuminance(
    mixChannels(mid, palette.land, LABEL_GROUND_BLEND),
    target,
  );
}

/** Motorway guide overlay: a faint line along real motorways. Visual only, not a gameplay number. */
export const GUIDE_STYLE = { alpha: 0.3, widthTiles: 0.12 } as const;
