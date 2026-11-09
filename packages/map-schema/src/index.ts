import { z } from 'zod';
import {
  PACE_LIMITS,
  type PaceKey,
  RESTRICTABLE_OFFERS,
  Terrain,
} from '@overpass-game/sim';
import { parseWith } from './errors.ts';

export {
  defaultPace,
  PACE_KEYS,
  PACE_LIMITS,
  type PaceKey,
  type PaceRule,
  RESTRICTABLE_OFFERS,
  type RestrictableOffer,
} from '@overpass-game/sim';

export * from './errors.ts';
export * from './save.ts';

export const PACKAGE_NAME = '@overpass-game/map-schema' as const;

/** Version of the source and compiled map formats. Bump with a migration when either changes shape. */
export const MAP_SCHEMA_VERSION = 2 as const;

/** Content hashes are eight lower-case hex digits (see map-compiler's contentHash). */
const HASH = /^[0-9a-f]{8}$/;

const Vec2 = z.object({ x: z.number().finite(), y: z.number().finite() });

/**
 * A spline point. Handles are offsets from the point, not absolute positions, so moving a
 * point moves its handles with it.
 */
const SplinePoint = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  handleIn: Vec2.optional(),
  handleOut: Vec2.optional(),
});

const ShapeBase = z.object({
  id: z.string().min(1),
  kind: z.enum(['closedSpline', 'strokeSpline']),
  points: z.array(SplinePoint).min(2),
  /** Stroke width in grid tiles. Required for strokes, ignored for closed shapes. */
  width: z.number().positive().optional(),
  locked: z.boolean().optional(),
  origin: z.enum(['osm', 'painted']),
});

type ShapeFields = z.infer<typeof ShapeBase>;

function checkShape(s: ShapeFields, ctx: z.RefinementCtx): void {
  if (s.kind === 'closedSpline' && s.points.length < 3) {
    ctx.addIssue({
      code: 'custom',
      path: ['points'],
      message: 'a closed shape needs at least 3 points',
    });
  }
  if (s.kind === 'strokeSpline' && s.width === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['width'],
      message: 'a stroke needs a width',
    });
  }
}

/** A rivers, lakes, coast, mountain or park shape: closed or stroked. */
export const ShapeSchema = ShapeBase.superRefine(checkShape);

const ClosedBase = ShapeBase.extend({ kind: z.literal('closedSpline') });

/** A region with an area, such as a lake or park: always closed. */
export const ClosedShapeSchema = ClosedBase.superRefine(checkShape);

export const PolylineSchema = z.object({
  id: z.string().min(1),
  points: z.array(Vec2).min(2),
});

/** One pace setting: a number inside its range, a whole number where the setting counts things. */
function paceField(key: PaceKey) {
  const { min, max, integer } = PACE_LIMITS[key];
  return (integer ? z.int() : z.number().finite()).min(min).max(max).optional();
}

export const MapRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('allowedOffers'),
    options: z.array(z.enum(RESTRICTABLE_OFFERS)).min(1),
  }),
  // A map's pace: each setting is optional, and a missing one uses the game's default.
  z.object({
    kind: z.literal('pace'),
    colours: paceField('colours'),
    fenceStepsPerWeek: paceField('fenceStepsPerWeek'),
    arrivalStartWeek: paceField('arrivalStartWeek'),
    arrivalsPerWeek: paceField('arrivalsPerWeek'),
    demandPace: paceField('demandPace'),
    startRoads: paceField('startRoads'),
  }),
]);

/** The fence a map starts inside: a rectangle of tiles. It grows from here each week (spec: Expansion). */
export const FenceSchema = z.object({
  col: z.int().min(0),
  row: z.int().min(0),
  cols: z.int().min(1),
  rows: z.int().min(1),
});
export type Fence = z.infer<typeof FenceSchema>;

/** True when a fence lies wholly inside a grid of `cols` by `rows` tiles. */
function fenceFits(f: Fence, cols: number, rows: number): boolean {
  return f.col + f.cols <= cols && f.row + f.rows <= rows;
}

const TerrainCode = z.int().min(0).max(Terrain.OutOfBounds);

/** Hand-edited source map. Only the Map Studio reads and writes these (`*.map-src.json`). */
/** A text label on a park, mountain or water region. Position and size are in grid units. */
export const MapLabelSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['park', 'mountain', 'water']),
  /**
   * The stored label colour to draw in, by kind name, when the author overrides the default. Absent
   * means the label's own kind. Named, not a hex value, so it follows the palette and the mode.
   */
  colour: z.enum(['park', 'mountain', 'water']).optional(),
  text: z.string().trim().min(1).max(40),
  x: z.number().finite(),
  y: z.number().finite(),
  size: z.number().positive().max(20),
});
export type MapLabel = z.infer<typeof MapLabelSchema>;

export const SourceMapSchema = z.object({
  schemaVersion: z.literal(MAP_SCHEMA_VERSION),
  id: z.string().regex(/^[a-z0-9-]+$/, 'use lower-case letters, digits and -'),
  name: z.string().min(1),
  region: z.object({
    bbox: z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
    ]),
    rotationDeg: z.number().finite(),
  }),
  grid: z
    .object({
      cols: z.int().min(1),
      rows: z.int().min(1),
      fence: FenceSchema,
    })
    .superRefine((g, ctx) => {
      if (!fenceFits(g.fence, g.cols, g.rows)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fence'],
          message: 'the fence must lie inside the grid',
        });
      }
    }),
  layers: z.object({
    water: z.array(ShapeSchema),
    mountains: z.array(ShapeSchema),
    parks: z.array(ShapeSchema),
    motorwayGuide: z.array(PolylineSchema),
    starterRoads: z.array(PolylineSchema),
    labels: z.array(MapLabelSchema).default([]),
  }),
  rules: z.array(MapRuleSchema),
  palette: z.string().min(1),
  // The water choice. Maps made before water had its own choice draw the shared ramp.
  waterPalette: z.string().min(1).default('shared'),
  attribution: z.string().min(1),
  osmImport: z
    .object({ fetchedAt: z.string().min(1), queryHash: z.string().min(1) })
    .optional(),
});

/** A closed or stroked outline, sampled into points in grid units. */
export const OutlinePathSchema = z.object({
  closed: z.boolean(),
  width: z.number().positive().optional(),
  points: z.array(Vec2).min(2),
});

/** A run of tiles, each 8-adjacent to the next, by tile index. */
const TilePathSchema = z.array(z.int().min(0)).min(2);

/**
 * Compiled map the game loads (`*.map.json`). Tile arrays are row by row: index = y * cols + x.
 * The game does no geometry work: outlines are already sampled.
 */
export const CompiledMapSchema = z
  .object({
    schemaVersion: z.literal(MAP_SCHEMA_VERSION),
    id: z.string().min(1),
    name: z.string().min(1),
    cols: z.int().min(1),
    rows: z.int().min(1),
    terrain: z.array(TerrainCode),
    fence: FenceSchema,
    outlines: z.object({
      water: z.array(OutlinePathSchema),
      mountains: z.array(OutlinePathSchema),
      parks: z.array(OutlinePathSchema),
    }),
    /** Guide lines in grid units, already clipped to the grid (drawn smooth, not stepped). */
    motorwayGuide: z.array(z.array(Vec2).min(2)),
    starterRoads: z.array(TilePathSchema),
    labels: z.array(MapLabelSchema).default([]),
    rules: z.array(MapRuleSchema),
    palette: z.string().min(1),
    waterPalette: z.string().min(1).default('shared'),
    attribution: z.string().min(1),
    contentHash: z.string().regex(HASH),
  })
  .superRefine((m, ctx) => {
    const n = m.cols * m.rows;
    if (!fenceFits(m.fence, m.cols, m.rows)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fence'],
        message: 'the fence must lie inside the grid',
      });
    }
    const sized: [keyof typeof m, number][] = [['terrain', n]];
    for (const [key, want] of sized) {
      const got = (m[key] as unknown[]).length;
      if (got !== n) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `expected ${want} entries (cols * rows), got ${got}`,
        });
      }
    }
    const paths: [string, number[][]][] = [['starterRoads', m.starterRoads]];
    for (const [key, list] of paths) {
      list.forEach((path, i) => {
        for (let k = 0; k < path.length; k++) {
          const t = path[k] as number;
          if (t >= n) {
            ctx.addIssue({
              code: 'custom',
              path: [key, i, k],
              message: `tile ${t} is outside the ${m.cols}x${m.rows} grid`,
            });
            return;
          }
          if (k === 0) continue;
          const prev = path[k - 1] as number;
          const dx = Math.abs((prev % m.cols) - (t % m.cols));
          const dy = Math.abs(
            Math.floor(prev / m.cols) - Math.floor(t / m.cols),
          );
          if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
            ctx.addIssue({
              code: 'custom',
              path: [key, i, k],
              message: `tile ${t} does not touch tile ${prev}`,
            });
            return;
          }
        }
      });
    }
  });

export type SourceMap = z.infer<typeof SourceMapSchema>;
export type CompiledMap = z.infer<typeof CompiledMapSchema>;
export type Shape = z.infer<typeof ShapeSchema>;
export type Polyline = z.infer<typeof PolylineSchema>;
export type MapRuleSource = z.infer<typeof MapRuleSchema>;
export type OutlinePath = z.infer<typeof OutlinePathSchema>;

export function parseSourceMap(data: unknown): SourceMap {
  return parseWith(SourceMapSchema, data, 'source map');
}

export function parseCompiledMap(data: unknown): CompiledMap {
  return parseWith(CompiledMapSchema, data, 'compiled map');
}
