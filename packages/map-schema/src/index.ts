import { z } from 'zod';
import { DEFAULT_TUNING, Terrain } from '@overpass-game/sim';

export const PACKAGE_NAME = '@overpass-game/map-schema' as const;

/** Version of the source and compiled map formats. Bump with a migration when either changes shape. */
export const MAP_SCHEMA_VERSION = 1 as const;

/** Version of the save file format. Migrations arrive with M11. */
export const SAVE_SCHEMA_VERSION = 1 as const;

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

/** A region with an area: districts and spawn zones are always closed. */
export const ClosedShapeSchema = ClosedBase.superRefine(checkShape);

/** A spawn zone: a closed region with a relative weight for houses and destinations. */
export const SpawnZoneSchema = ClosedBase.extend({
  weight: z.number().positive(),
}).superRefine(checkShape);

export const PolylineSchema = z.object({
  id: z.string().min(1),
  points: z.array(Vec2).min(2),
});

export const MapRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unlockColour'),
    colour: z
      .int()
      .min(0)
      .max(DEFAULT_TUNING.BUILDING_COLOR_COUNT - 1),
    week: z.int().min(1),
  }),
]);

/** A district region: tiles inside it belong to `district`. Later entries win. */
export const DistrictRegionSchema = z.object({
  district: z.int().min(0),
  region: ClosedShapeSchema,
});

const TerrainCode = z.int().min(0).max(Terrain.OutOfBounds);

/** Hand-edited source map. Only the Map Studio reads and writes these (`*.map-src.json`). */
/** A text label on a park, mountain or water region. Position and size are in grid units. */
export const MapLabelSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['park', 'mountain', 'water']),
  text: z.string().trim().min(1).max(40),
  x: z.number().finite(),
  y: z.number().finite(),
  size: z.number().positive().max(10),
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
  grid: z.object({
    cols: z.int().min(1),
    rows: z.int().min(1),
    districts: z.array(DistrictRegionSchema),
  }),
  layers: z.object({
    water: z.array(ShapeSchema),
    mountains: z.array(ShapeSchema),
    parks: z.array(ShapeSchema),
    spawnZones: z.array(SpawnZoneSchema),
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
    districts: z.array(z.int().min(0)),
    spawnWeights: z.array(z.number().finite().min(0)),
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
    const sized: [keyof typeof m, number][] = [
      ['terrain', n],
      ['districts', n],
      ['spawnWeights', n],
    ];
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

/** Save file (`*.save.json`, or an exported save code). Sim state is checked again on load (M11). */
export const SaveFileSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  mapId: z.string().min(1),
  mapHash: z.string().regex(HASH),
  settings: z.object({ motorwayGuide: z.boolean() }),
  sim: z.record(z.string(), z.unknown()),
});

export type SourceMap = z.infer<typeof SourceMapSchema>;
export type CompiledMap = z.infer<typeof CompiledMapSchema>;
export type SaveFile = z.infer<typeof SaveFileSchema>;
export type Shape = z.infer<typeof ShapeSchema>;
export type SpawnZone = z.infer<typeof SpawnZoneSchema>;
export type Polyline = z.infer<typeof PolylineSchema>;
export type MapRuleSource = z.infer<typeof MapRuleSchema>;
export type OutlinePath = z.infer<typeof OutlinePathSchema>;

/** Thrown when a map or save file does not match its schema. `issues` names each bad field. */
export class MapFormatError extends Error {
  readonly issues: string[];

  constructor(what: string, issues: string[]) {
    super(`${what} is invalid: ${issues.join('; ')}`);
    this.name = 'MapFormatError';
    this.issues = issues;
  }
}

function parseWith<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues.map(
    (i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`,
  );
  throw new MapFormatError(what, issues);
}

export function parseSourceMap(data: unknown): SourceMap {
  return parseWith(SourceMapSchema, data, 'source map');
}

export function parseCompiledMap(data: unknown): CompiledMap {
  return parseWith(CompiledMapSchema, data, 'compiled map');
}

export function parseSave(data: unknown): SaveFile {
  return parseWith(SaveFileSchema, data, 'save file');
}
