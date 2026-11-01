import { describe, expect, it } from 'vitest';
import {
  BASE_PALETTE_IDS,
  BASE_PALETTES,
  BUILDING_COLORS,
  DEBUG_PALETTE,
  PACKAGE_NAME,
  PALETTE,
  ROAD_WIDTH_TILES,
  STANDARD_BUILDING_PALETTE,
  TILE_SIZE,
  LABEL_CONTRAST,
  contrastRatio,
  labelColour,
  resolvePalette,
  type MapPalette,
  type ThemeMode,
} from '../src/index.ts';

const MODES: ThemeMode[] = ['light', 'dark'];

function allBasePalettes(): MapPalette[] {
  return BASE_PALETTE_IDS.flatMap((id) =>
    MODES.map((m) => BASE_PALETTES[id][m]),
  );
}

/** Every colour in a palette, with tint arrays flattened. */
function coloursOf(palette: MapPalette): number[] {
  return Object.values(palette).flatMap((v) =>
    typeof v === 'number' ? [v] : [...v],
  );
}

describe('@overpass-game/render-style', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@overpass-game/render-style');
  });

  it('uses a positive whole-pixel tile size', () => {
    expect(Number.isInteger(TILE_SIZE) && TILE_SIZE > 0).toBe(true);
  });

  it('keeps road width strictly inside one tile', () => {
    expect(ROAD_WIDTH_TILES).toBeGreaterThan(0);
    expect(ROAD_WIDTH_TILES).toBeLessThan(1);
  });

  it('defines every palette colour as a 24-bit hex number', () => {
    for (const palette of allBasePalettes()) {
      for (const color of coloursOf(palette)) {
        expect(Number.isInteger(color)).toBe(true);
        expect(color).toBeGreaterThanOrEqual(0);
        expect(color).toBeLessThanOrEqual(0xffffff);
      }
    }
    for (const color of [...Object.values(DEBUG_PALETTE), ...BUILDING_COLORS]) {
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('gives every base palette a light and a dark variant', () => {
    for (const id of BASE_PALETTE_IDS) {
      expect(BASE_PALETTES[id].light).toBeDefined();
      expect(BASE_PALETTES[id].dark).toBeDefined();
    }
  });

  it('gives each terrain three tints and the water ramp nine steps', () => {
    for (const palette of allBasePalettes()) {
      expect(palette.landTints).toHaveLength(3);
      expect(palette.waterRamp).toHaveLength(9);
      expect(palette.waterRamp).toContain(palette.water);
    }
  });

  it('uses the approved accent values in both modes', () => {
    expect(BASE_PALETTES.yellow.light).toMatchObject({
      road: 0xe8e4d8,
      kerb: 0xe8e4d8,
      motorway: 0x9aa7b8,
      motorwayContrast: 0x9aa7b8,
      motorwayBadge: 0x9aa7b8,
    });
    expect(BASE_PALETTES.yellow.dark).toMatchObject({
      road: 0x4a5262,
      kerb: 0x6b7486,
      motorway: 0x4a5262,
      motorwayContrast: 0xf2f2f2,
      motorwayBadge: 0xf2b84b,
    });
  });

  it('derives each terrain shadow as a darker shade of its ground', () => {
    for (const id of BASE_PALETTE_IDS) {
      for (const mode of MODES) {
        const p = BASE_PALETTES[id][mode];
        const lum = (c: number) =>
          ((c >> 16) & 0xff) * 0.3 +
          ((c >> 8) & 0xff) * 0.59 +
          (c & 0xff) * 0.11;
        expect(lum(p.shadow)).toBeLessThan(lum(p.land));
      }
    }
  });

  it('keeps the default light palette as the scene colours', () => {
    expect(PALETTE).toBe(BASE_PALETTES.default.light);
  });

  it('keeps the motorway contrast stroke distinct from the pavement', () => {
    for (const palette of allBasePalettes()) {
      expect(palette.motorwayContrast).not.toBe(palette.road);
    }
  });

  it('keeps the mountain colour distinct from the ground', () => {
    for (const palette of allBasePalettes()) {
      expect(palette.mountain).not.toBe(palette.land);
    }
  });

  // resolvePalette merges in the water set, so it returns a new object with the family's values.
  it('resolves a palette id and mode to that family', () => {
    expect(resolvePalette('default', 'light')).toStrictEqual(
      BASE_PALETTES.default.light,
    );
    expect(resolvePalette('default', 'dark')).toStrictEqual(
      BASE_PALETTES.default.dark,
    );
  });

  it('falls back to the default palette for an unknown id', () => {
    expect(resolvePalette('no-such-palette', 'dark')).toStrictEqual(
      BASE_PALETTES.default.dark,
    );
    expect(resolvePalette('__proto__', 'light')).toStrictEqual(
      BASE_PALETTES.default.light,
    );
  });

  it('gives every building a distinct face and a shaded side', () => {
    expect(STANDARD_BUILDING_PALETTE).toHaveLength(6);
    const faces = new Set(STANDARD_BUILDING_PALETTE.map((s) => s.face));
    expect(faces.size).toBe(STANDARD_BUILDING_PALETTE.length);
    for (const style of STANDARD_BUILDING_PALETTE) {
      expect(style.side).not.toBe(style.face);
    }
  });

  it('keeps building colours standard and separate from base palettes', () => {
    expect(BUILDING_COLORS).toEqual(
      STANDARD_BUILDING_PALETTE.map((s) => s.face),
    );
    const baseColours = new Set(allBasePalettes().flatMap(coloursOf));
    for (const style of STANDARD_BUILDING_PALETTE) {
      for (const colour of [style.face, style.side]) {
        expect(baseColours.has(colour)).toBe(false);
      }
    }
  });
});

/** Approved ground and shadow colours, light and dark. Changing these needs sign-off. */
const APPROVED_GROUND: Record<string, [number, number, number, number]> = {
  red: [0xefccc8, 0xa1453a, 0xd37368, 0x7a2c24],
  orange: [0xf0d4c2, 0xa46135, 0xd79061, 0x7d451f],
  yellow: [0xf3ecc4, 0xaa9a31, 0xddcc5f, 0x82751c],
  green: [0xc4e3bf, 0x4e8c45, 0x78c06d, 0x35692d],
  blue: [0xc2d5eb, 0x3e6899, 0x6897cd, 0x274b74],
  indigo: [0xc6c6e7, 0x474790, 0x7272c3, 0x2e2e6c],
  violet: [0xe0c9e8, 0x7f4891, 0xb074c4, 0x5e2f6d],
  white: [0xefeeeb, 0x837b6a, 0xb5aea1, 0x60594b],
  black: [0x999ca3, 0x4c4e52, 0x6c7078, 0x36383c],
};

const luminance = (c: number): number =>
  ((c >> 16) & 0xff) * 0.3 + ((c >> 8) & 0xff) * 0.59 + (c & 0xff) * 0.11;

describe('approved terrain colours', () => {
  it('keeps approved ground and shadow values for every family', () => {
    for (const [id, [lg, dg, ls, ds]] of Object.entries(APPROVED_GROUND)) {
      expect(BASE_PALETTES[id as keyof typeof BASE_PALETTES].light.land).toBe(
        lg,
      );
      expect(BASE_PALETTES[id as keyof typeof BASE_PALETTES].dark.land).toBe(
        dg,
      );
      expect(BASE_PALETTES[id as keyof typeof BASE_PALETTES].light.shadow).toBe(
        ls,
      );
      expect(BASE_PALETTES[id as keyof typeof BASE_PALETTES].dark.shadow).toBe(
        ds,
      );
    }
  });

  it('makes mountains darker than their ground, and parks sit between', () => {
    for (const id of BASE_PALETTE_IDS) {
      for (const mode of MODES) {
        const p = BASE_PALETTES[id][mode];
        expect(luminance(p.mountain)).toBeLessThan(luminance(p.land));
        expect(luminance(p.park)).toBeLessThan(luminance(p.land));
        expect(luminance(p.mountain)).toBeLessThan(luminance(p.park));
      }
    }
  });

  it('borders each region with the opposite mode colour', () => {
    for (const id of BASE_PALETTE_IDS) {
      expect(BASE_PALETTES[id].light.mountainEdge).toBe(
        BASE_PALETTES[id].dark.mountain,
      );
      expect(BASE_PALETTES[id].dark.mountainEdge).toBe(
        BASE_PALETTES[id].light.mountain,
      );
      expect(BASE_PALETTES[id].light.parkEdge).toBe(
        BASE_PALETTES[id].dark.park,
      );
      expect(BASE_PALETTES[id].light.waterEdge).toBe(
        BASE_PALETTES[id].dark.water,
      );
      expect(BASE_PALETTES[id].dark.waterEdge).toBe(
        BASE_PALETTES[id].light.water,
      );
    }
  });

  it('takes the main water colour from the ramp', () => {
    for (const id of BASE_PALETTE_IDS) {
      expect(BASE_PALETTES[id].light.water).toBe(
        BASE_PALETTES[id].light.waterRamp[4],
      );
      expect(BASE_PALETTES[id].dark.water).toBe(
        BASE_PALETTES[id].dark.waterRamp[4],
      );
    }
  });
});

describe('label colours', () => {
  it('reaches the target contrast against the ground', () => {
    for (const id of BASE_PALETTE_IDS) {
      for (const mode of MODES) {
        const p = BASE_PALETTES[id][mode];
        for (const kind of ['mountain', 'park', 'water'] as const) {
          expect(
            Math.abs(
              contrastRatio(labelColour(p, kind), p.land) - LABEL_CONTRAST,
            ),
          ).toBeLessThan(0.05);
        }
      }
    }
  });

  it('returns 24-bit colours', () => {
    for (const id of BASE_PALETTE_IDS) {
      for (const mode of MODES) {
        const p = BASE_PALETTES[id][mode];
        for (const kind of ['mountain', 'park', 'water'] as const) {
          const c = labelColour(p, kind);
          expect(Number.isInteger(c) && c >= 0 && c <= 0xffffff).toBe(true);
        }
      }
    }
  });
});
