import {
  createGrid,
  createSim,
  tuning,
  type SimState,
} from '@overpass-game/sim';
import {
  SAVE_FORMAT,
  SAVE_SCHEMA_VERSION,
  type SaveBundle,
} from '@overpass-game/map-schema';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryStore, type RecordStore } from '../save/store.ts';
import {
  BLOCKED_MESSAGE,
  clearRun,
  currentBest,
  exportBundle,
  initProgress,
  loadRun,
  recordFinishedRun,
  replaceProgress,
  savedSettings,
  saveRun,
  savedWeeks,
  setSavedSettings,
  storageStatus,
  UNREADABLE_MESSAGE,
} from './progress.ts';

const MAP = 'tulsa-oklahoma-united-states';
const KEY = `campaign/${MAP}`;

function sim(tick = 0): SimState {
  const s = createSim({ seed: 5, grid: createGrid(4, 4) });
  s.tick = tick;
  return s;
}

function bundle(extra: Partial<SaveBundle> = {}): SaveBundle {
  return {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    settings: null,
    best: {},
    runs: {},
    ...extra,
  };
}

/** Starts from a fresh memory store, as a browser with empty storage would. */
async function fresh(store: RecordStore = memoryStore()): Promise<RecordStore> {
  await initProgress(() => store);
  return store;
}

afterEach(() => initProgress(() => memoryStore()));

describe('progress', () => {
  it('starts empty and durable when storage works', async () => {
    await fresh();
    expect(storageStatus()).toEqual({ durable: true, problem: null });
    expect(currentBest()).toEqual({});
    expect(savedSettings()).toBeNull();
  });

  it('keeps the best trips per map and never lowers it', async () => {
    await fresh();
    recordFinishedRun('campaign', MAP, 5);
    recordFinishedRun('campaign', MAP, 3);
    expect(currentBest()[KEY]).toBe(5);
  });

  it('saves a run, and gives back a copy the game can change', async () => {
    await fresh();
    saveRun('campaign', MAP, 'a1b2c3d4', sim(1800));
    const first = loadRun('campaign', MAP);
    expect(first?.mapHash).toBe('a1b2c3d4');
    expect(first?.sim.tick).toBe(1800);
    if (first) first.sim.tick = 999;
    expect(loadRun('campaign', MAP)?.sim.tick).toBe(1800);
  });

  it('reports the week of each saved campaign run for the map select', async () => {
    await fresh();
    saveRun('campaign', MAP, 'a1b2c3d4', sim(2 * tuning.WEEK_TICKS));
    expect(savedWeeks()).toEqual({ [MAP]: 3 });
  });

  it('removes a run when it finishes, so there is nothing left to resume', async () => {
    await fresh();
    saveRun('campaign', MAP, 'a1b2c3d4', sim(1800));
    recordFinishedRun('campaign', MAP, 4);
    expect(loadRun('campaign', MAP)).toBeNull();
    expect(currentBest()[KEY]).toBe(4);
  });

  it('removes a run on request', async () => {
    await fresh();
    saveRun('campaign', MAP, 'a1b2c3d4', sim());
    clearRun('campaign', MAP);
    expect(loadRun('campaign', MAP)).toBeNull();
  });

  it('keeps settings, and saves them for the next visit', async () => {
    const store = await fresh();
    const chosen = {
      motorwayGuide: false,
      theme: 'dark' as const,
      buildingSymbols: true,
      renderScale: 100 as const,
      antiAliasing: true,
      menuTransitions: true,
      drawMode: 'drag' as const,
      holdToErase: true,
      touchAutoZoom: false,
      zoomLevel: 1 as const,
    };
    setSavedSettings(chosen);
    expect(savedSettings()).toEqual(chosen);
    await initProgress(() => store);
    expect(savedSettings()).toEqual(chosen);
  });

  it('carries best scores and runs across a reload', async () => {
    const store = await fresh();
    recordFinishedRun('campaign', 'other-map', 9);
    saveRun('campaign', MAP, 'a1b2c3d4', sim(1800));
    await initProgress(() => store);
    expect(currentBest()['campaign/other-map']).toBe(9);
    expect(loadRun('campaign', MAP)?.sim.tick).toBe(1800);
  });

  it('keeps the player playing from memory when storage is blocked', async () => {
    await initProgress(() => {
      throw new Error('no storage');
    });
    expect(storageStatus()).toEqual({
      durable: false,
      problem: BLOCKED_MESSAGE,
    });
    recordFinishedRun('campaign', MAP, 2);
    expect(currentBest()[KEY]).toBe(2);
  });

  it('keeps unreadable saved data aside instead of overwriting it', async () => {
    const store = memoryStore();
    const raw = { format: 'not-a-save' };
    await store.set('progress', raw);
    await initProgress(() => store);
    expect(storageStatus().problem).toBe(UNREADABLE_MESSAGE);
    expect(currentBest()).toEqual({});
    await expect(store.get('progress-unreadable')).resolves.toEqual(raw);
  });

  it('exports the whole progress, and an import replaces it', async () => {
    await fresh();
    recordFinishedRun('campaign', MAP, 6);
    saveRun('campaign', MAP, 'a1b2c3d4', sim(1800));
    const exported = exportBundle();
    expect(exported.best[KEY]).toBe(6);
    expect(exported.runs[KEY]?.mapHash).toBe('a1b2c3d4');

    replaceProgress(bundle({ best: { 'campaign/other-map': 11 } }));
    expect(currentBest()).toEqual({ 'campaign/other-map': 11 });
    expect(loadRun('campaign', MAP)).toBeNull();
  });
});
