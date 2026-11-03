import { bestKey, type SimState } from '@overpass-game/sim';
import { z } from 'zod';
import { MapFormatError, parseWith } from './errors.ts';

/**
 * The save bundle: the one record the game keeps for progress (best scores, settings and any
 * run in progress), and the same object an export carries. Spec: Persistence (M11).
 */

/** Names the file type, so a file from another app is refused with a clear message. */
export const SAVE_FORMAT = 'overpass-game-save' as const;

/** Version of the save format. Bump it with a migration whenever the shape changes. */
export const SAVE_SCHEMA_VERSION = 4 as const;

/** Content hashes are eight lower-case hex digits (see map-compiler's contentHash). */
const HASH = /^[0-9a-f]{8}$/;
const MAP_ID = /^[a-z0-9-]+$/;
const Count = z.int().min(0);

/**
 * Every key of the sim's state. A saved run must carry all of them, so the schema is checked
 * against `createSim` in a test: a new sim field has to be added here too.
 */
export const SIM_STATE_KEYS = [
  'tick',
  'rng',
  'grid',
  'roads',
  'links',
  'budget',
  'graph',
  'buildings',
  'buildingAt',
  'districtOf',
  'homes',
  'demand',
  'cars',
  'nextCarId',
  'over',
  'tripsCompleted',
  'offers',
  'stock',
  'crossingRunOf',
  'crossingRuns',
  'nextCrossingRunId',
  'motorways',
  'nextMotorwayId',
  'controls',
  'rules',
] as const satisfies readonly (keyof SimState)[];

/**
 * A saved sim. The fields that are sized by the grid, and the counters, are checked here. The
 * other fields are kept as the sim wrote them: the sim's own rules are the authority on them,
 * and loose objects keep any field the schema does not name, so a load never drops data.
 */
export const SimSaveSchema = z
  .looseObject({
    tick: Count,
    rng: z.looseObject({ state: z.int().min(0).max(4294967295) }),
    grid: z.looseObject({
      cols: z.int().min(1),
      rows: z.int().min(1),
      terrain: z.array(Count),
    }),
    roads: z.array(z.int().min(0).max(1)),
    links: z.record(z.string(), z.array(Count)),
    budget: Count,
    buildingAt: z.array(z.int().min(-1)),
    districtOf: z.array(Count),
    crossingRunOf: z.array(Count),
    tripsCompleted: Count,
    nextCarId: Count,
    nextCrossingRunId: Count,
    nextMotorwayId: Count,
    over: z.looseObject({ tick: Count, destination: Count }).nullable(),
  })
  .superRefine((sim, ctx) => {
    for (const key of SIM_STATE_KEYS) {
      if (!(key in sim)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'missing from the saved sim state',
        });
      }
    }
    const tiles = sim.grid.cols * sim.grid.rows;
    const sized: [string, number][] = [
      ['grid.terrain', sim.grid.terrain.length],
      ['roads', sim.roads.length],
      ['buildingAt', sim.buildingAt.length],
      ['districtOf', sim.districtOf.length],
      ['crossingRunOf', sim.crossingRunOf.length],
    ];
    for (const [path, length] of sized) {
      if (length !== tiles) {
        ctx.addIssue({
          code: 'custom',
          path: [path],
          message: `expected ${tiles} tiles (cols x rows), found ${length}`,
        });
      }
    }
  });

export const RunSaveSchema = z.object({
  mode: z.enum(['campaign', 'challenge']),
  mapId: z.string().regex(MAP_ID),
  /** The content hash of the map the run was played on. A changed map cannot resume the run. */
  mapHash: z.string().regex(HASH),
  /** When the run was saved, as an ISO 8601 time. */
  savedAt: z.string().min(1),
  sim: SimSaveSchema,
});

export const SettingsSaveSchema = z.object({
  motorwayGuide: z.boolean(),
  theme: z.enum(['light', 'dark']),
  buildingSymbols: z.boolean(),
  /** Smooths the edges of drawn shapes. Applies from the next game. */
  antiAliasing: z.boolean(),
  /** Fades the menu screens in and out. */
  menuTransitions: z.boolean(),
  /** 'waypoints' lays road between clicks; 'drag' draws as the pointer moves. */
  drawMode: z.enum(['drag', 'waypoints']),
  /** On: a touch held still erases. Off: it places a tile. */
  holdToErase: z.boolean(),
  /** After a touch stroke, the camera zooms so the whole stroke is in view. */
  touchAutoZoom: z.boolean(),
  /** The zoom each game opens at, as a multiple of fit-to-screen. */
  zoomLevel: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
});

export const SaveBundleSchema = z
  .object({
    format: z.literal(SAVE_FORMAT),
    schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
    /** Null until the player changes a setting; the game then uses its defaults. */
    settings: SettingsSaveSchema.nullable(),
    /** Best trips per play, keyed like the sim's `bestKey`. */
    best: z.record(z.string(), Count),
    /** Runs in progress, keyed by `bestKey(mode, mapId)`: at most one per play. */
    runs: z.record(z.string(), RunSaveSchema),
  })
  .superRefine((bundle, ctx) => {
    for (const [key, run] of Object.entries(bundle.runs)) {
      if (key !== bestKey(run.mode, run.mapId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['runs', key],
          message: `key should be ${bestKey(run.mode, run.mapId)}`,
        });
      }
    }
  });

export type SimSave = z.infer<typeof SimSaveSchema>;
export type RunSave = z.infer<typeof RunSaveSchema>;
export type SettingsSave = z.infer<typeof SettingsSaveSchema>;
export type SaveBundle = z.infer<typeof SaveBundleSchema>;

/** Turns a save written by an older version into the current shape, one version at a time. */
export type SaveMigration = (
  save: Record<string, unknown>,
) => Record<string, unknown>;

/**
 * Version 2 adds the display and menu settings. A version 1 save gets the defaults that match the
 * version 1 game, so it plays the same until the player changes them.
 */
const ADD_DISPLAY_SETTINGS: SaveMigration = (save) => {
  const settings = save.settings;
  if (typeof settings !== 'object' || settings === null) return save;
  return {
    ...save,
    settings: {
      renderScale: 100,
      antiAliasing: true,
      menuTransitions: true,
      ...settings,
    },
  };
};

/**
 * Version 3 adds the input and zoom settings. Defaults match the version 2 game: drag to draw,
 * hold to erase on, no auto-zoom, and the fit-to-screen zoom.
 */
const ADD_INPUT_SETTINGS: SaveMigration = (save) => {
  const settings = save.settings;
  if (typeof settings !== 'object' || settings === null) return save;
  return {
    ...save,
    settings: {
      drawMode: 'drag',
      holdToErase: true,
      touchAutoZoom: false,
      zoomLevel: 1,
      ...settings,
    },
  };
};

/** Version 4 drops the render scale setting, which the game cannot apply. */
const DROP_RENDER_SCALE: SaveMigration = (save) => {
  const settings = save.settings;
  if (typeof settings !== 'object' || settings === null) return save;
  const next: Record<string, unknown> = { ...settings };
  delete next.renderScale;
  return { ...save, settings: next };
};

/** Migrations keyed by the version they upgrade from. */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: ADD_DISPLAY_SETTINGS,
  2: ADD_INPUT_SETTINGS,
  3: DROP_RENDER_SCALE,
};

/**
 * Brings a save to the current version. A save from a newer version is refused, since guessing
 * at its fields could lose data. Throws MapFormatError for anything that cannot be migrated.
 */
export function migrateSave(
  data: unknown,
  migrations: Readonly<Record<number, SaveMigration>> = SAVE_MIGRATIONS,
): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new MapFormatError('save', ['(root): expected an object']);
  }
  let save = data as Record<string, unknown>;
  const version = save.schemaVersion;
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 0
  ) {
    throw new MapFormatError('save', [
      'schemaVersion: expected a whole number',
    ]);
  }
  if (version > SAVE_SCHEMA_VERSION) {
    throw new MapFormatError('save', [
      `schemaVersion: ${version} is newer than this game reads (${SAVE_SCHEMA_VERSION}); update the game to load it`,
    ]);
  }
  for (let v = version; v < SAVE_SCHEMA_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) {
      throw new MapFormatError('save', [
        `schemaVersion: no migration from ${v}`,
      ]);
    }
    save = { ...migrate(save), schemaVersion: v + 1 };
  }
  return save;
}

/** Migrates, then checks, a save bundle. Throws MapFormatError naming each bad field. */
export function parseSaveBundle(
  data: unknown,
  migrations?: Readonly<Record<number, SaveMigration>>,
): SaveBundle {
  return parseWith(SaveBundleSchema, migrateSave(data, migrations), 'save');
}
