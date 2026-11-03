import { bestKey, createGrid, createSim } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import {
  MapFormatError,
  migrateSave,
  parseSaveBundle,
  SAVE_SCHEMA_VERSION,
  SIM_STATE_KEYS,
} from '../src/index.ts';

/** A sim as a save holds it: built, then through JSON, like a load from storage. */
const savedSim = (): Record<string, unknown> =>
  JSON.parse(
    JSON.stringify(createSim({ seed: 7, grid: createGrid(4, 3) })),
  ) as Record<string, unknown>;

const run = (sim = savedSim()) => ({
  mode: 'campaign',
  mapId: 'tulsa-oklahoma-united-states',
  mapHash: 'a1b2c3d4',
  savedAt: '2026-11-02T12:00:00.000Z',
  sim,
});

const bundle = (extra: Record<string, unknown> = {}) => ({
  format: 'overpass-game-save',
  schemaVersion: SAVE_SCHEMA_VERSION,
  settings: null,
  best: {},
  runs: {},
  ...extra,
});

const key = bestKey('campaign', 'tulsa-oklahoma-united-states');

describe('save bundle', () => {
  it('accepts an empty bundle and one with a run in progress', () => {
    expect(() => parseSaveBundle(bundle())).not.toThrow();
    expect(() =>
      parseSaveBundle(bundle({ runs: { [key]: run() }, best: { [key]: 4 } })),
    ).not.toThrow();
  });

  it('refuses something that is not a save object', () => {
    expect(() => parseSaveBundle('save')).toThrow(MapFormatError);
    expect(() => parseSaveBundle(null)).toThrow(/expected an object/);
  });

  it('refuses a file from another format', () => {
    expect(() => parseSaveBundle(bundle({ format: 'other' }))).toThrow(
      /format/,
    );
  });

  it('names each sim field a run is missing', () => {
    const sim = savedSim();
    delete sim.homes;
    expect(() =>
      parseSaveBundle(bundle({ runs: { [key]: run(sim) } })),
    ).toThrow(/homes: missing from the saved sim state/);
  });

  it('refuses tile arrays that do not match the grid', () => {
    const sim = savedSim();
    (sim.roads as number[]).pop();
    expect(() =>
      parseSaveBundle(bundle({ runs: { [key]: run(sim) } })),
    ).toThrow(/roads: expected 12 tiles/);
  });

  it('refuses a run stored under a key that does not match it', () => {
    expect(() =>
      parseSaveBundle(
        bundle({ runs: { 'challenge/tulsa-oklahoma-united-states': run() } }),
      ),
    ).toThrow(/should be campaign\/tulsa-oklahoma-united-states/);
  });

  it('refuses a map hash that is not eight hex digits', () => {
    expect(() =>
      parseSaveBundle(
        bundle({ runs: { [key]: { ...run(), mapHash: 'not-a-hash' } } }),
      ),
    ).toThrow(/mapHash/);
  });

  it('refuses settings with an unknown theme', () => {
    expect(() =>
      parseSaveBundle(
        bundle({
          settings: {
            motorwayGuide: true,
            theme: 'blue',
            buildingSymbols: false,
            renderScale: 100,
            antiAliasing: true,
            menuTransitions: true,
            drawMode: 'drag',
            holdToErase: true,
            touchAutoZoom: false,
            zoomLevel: 1,
          },
        }),
      ),
    ).toThrow(/theme/);
  });

  it('keeps sim fields the schema does not name, so a load drops nothing', () => {
    const sim = { ...savedSim(), futureField: { kept: true } };
    const parsed = parseSaveBundle(bundle({ runs: { [key]: run(sim) } }));
    expect(parsed.runs[key]?.sim.futureField).toEqual({ kept: true });
  });

  it('refuses a save from a newer version rather than guessing', () => {
    expect(() =>
      parseSaveBundle(bundle({ schemaVersion: SAVE_SCHEMA_VERSION + 1 })),
    ).toThrow(/newer than this game reads/);
  });

  it('runs the migration chain from an older version', () => {
    const old = {
      format: 'overpass-game-save',
      schemaVersion: 0,
      best: {},
      runs: {},
    };
    const migrations = {
      0: (save: Record<string, unknown>) => ({ ...save, settings: null }),
    };
    const parsed = parseSaveBundle(old, migrations);
    expect(parsed.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(parsed.settings).toBeNull();
    expect(() => parseSaveBundle(old)).toThrow(/no migration from 0/);
  });

  it('leaves a current-version save as it is when migrating', () => {
    const current = bundle();
    expect(migrateSave(current)).toEqual(current);
  });
});

describe('sim state keys', () => {
  it('names every key the sim state has, so a save cannot lose one', () => {
    const simKeys = Object.keys(createSim({ seed: 1, grid: createGrid(2, 2) }));
    expect([...SIM_STATE_KEYS].sort()).toEqual([...simKeys].sort());
  });
});

describe('save migration to version 2', () => {
  it('adds the display and menu settings with the version 1 defaults', () => {
    const v1 = {
      format: 'overpass-game-save',
      schemaVersion: 1,
      settings: { motorwayGuide: false, theme: 'dark', buildingSymbols: true },
      best: {},
      runs: {},
    };
    const parsed = parseSaveBundle(v1);
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.settings).toEqual({
      motorwayGuide: false,
      theme: 'dark',
      buildingSymbols: true,
      renderScale: 100,
      antiAliasing: true,
      menuTransitions: true,
      drawMode: 'drag',
      holdToErase: true,
      touchAutoZoom: false,
      zoomLevel: 1,
    });
  });

  it('keeps a null settings block null', () => {
    const v1 = {
      format: 'overpass-game-save',
      schemaVersion: 1,
      settings: null,
      best: {},
      runs: {},
    };
    expect(parseSaveBundle(v1).settings).toBeNull();
  });
});
