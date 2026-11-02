import {
  bestKey,
  recordRun,
  weekOf,
  type BestScores,
  type PlayMode,
  type SimState,
} from '@overpass-game/sim';
import {
  parseSaveBundle,
  SAVE_FORMAT,
  SAVE_SCHEMA_VERSION,
  type RunSave,
  type SaveBundle,
  type SettingsSave,
} from '@overpass-game/map-schema';
import {
  fallbackStore,
  indexedStore,
  memoryStore,
  withTimeout,
  type RecordStore,
} from '../save/store.ts';

/**
 * Progress the player keeps: best scores, settings, and the run in progress on each campaign map.
 * It is one save bundle, held in memory and written to browser storage after each change. When
 * storage is blocked or fails, the game plays on from memory and says so (spec: Persistence).
 */

const PROGRESS_KEY = 'progress';
/** Where a save that could not be read is kept, so the player's data is not overwritten blind. */
const UNREADABLE_KEY = 'progress-unreadable';
const OPEN_TIMEOUT_MS = 3000;

export const BLOCKED_MESSAGE =
  'Browser storage is blocked here, so progress lasts only until this page is closed. Export a save to keep it.';
export const FAILED_MESSAGE =
  'Browser storage stopped working, so progress lasts only until this page is closed. Export a save to keep it.';
export const UNREADABLE_MESSAGE =
  'Saved progress could not be read, so it was not loaded. A copy was kept in this browser.';

export interface StorageStatus {
  /** True when progress is written to browser storage. False when it lasts only for this page. */
  durable: boolean;
  /** What the player should know about storage, or null when all is well. */
  problem: string | null;
}

/** A saved run, as the game gets it back to play. */
export interface SavedRun {
  mapHash: string;
  savedAt: string;
  sim: SimState;
}

interface Progress {
  settings: SettingsSave | null;
  best: Record<string, number>;
  runs: Record<string, RunSave>;
}

function emptyProgress(): Progress {
  return { settings: null, best: {}, runs: {} };
}

let progress: Progress = emptyProgress();
let store: RecordStore | null = null;
let status: StorageStatus = { durable: true, problem: null };

function bundleOf(p: Progress): SaveBundle {
  return {
    format: SAVE_FORMAT,
    schemaVersion: SAVE_SCHEMA_VERSION,
    settings: p.settings,
    best: p.best,
    runs: p.runs,
  };
}

function progressFrom(bundle: SaveBundle): Progress {
  return {
    settings: bundle.settings,
    best: { ...bundle.best },
    runs: { ...bundle.runs },
  };
}

/** Switches to memory-only storage, with the reason the player will see. */
function useMemory(message: string): void {
  store = memoryStore();
  status = { durable: false, problem: message };
}

/**
 * Loads the saved progress. Call once before the menu or a game starts. It never rejects: if
 * storage can't be opened or read, the game starts with empty progress and says why. `open` is
 * injectable so tests can use memory.
 */
export async function initProgress(
  open: () => RecordStore = () => indexedStore(),
): Promise<void> {
  progress = emptyProgress();
  status = { durable: true, problem: null };
  let primary: RecordStore;
  try {
    primary = open();
  } catch {
    useMemory(BLOCKED_MESSAGE);
    return;
  }
  store = fallbackStore(primary, () => {
    status = { durable: false, problem: FAILED_MESSAGE };
  });
  let raw: unknown;
  try {
    raw = await withTimeout(store.get(PROGRESS_KEY), OPEN_TIMEOUT_MS);
  } catch {
    useMemory(BLOCKED_MESSAGE);
    return;
  }
  if (raw === undefined) return;
  try {
    progress = progressFrom(parseSaveBundle(raw));
  } catch (err) {
    console.error(err);
    progress = emptyProgress();
    status = { durable: status.durable, problem: UNREADABLE_MESSAGE };
    await store.set(UNREADABLE_KEY, raw).catch(() => undefined);
  }
}

/** Writes the whole bundle. The copy is taken now, since the write finishes later. */
function persist(): void {
  if (!store) return;
  void store
    .set(PROGRESS_KEY, structuredClone(bundleOf(progress)))
    .catch((err: unknown) => console.error(err));
}

export function storageStatus(): StorageStatus {
  return { ...status };
}

/** The best trips on each play, read by the menu and the end screen. */
export function currentBest(): BestScores {
  return progress.best;
}

/** The settings the player last chose, or null when they have never changed one. */
export function savedSettings(): SettingsSave | null {
  return progress.settings;
}

export function setSavedSettings(settings: SettingsSave): void {
  progress.settings = { ...settings };
  persist();
}

/**
 * Records a finished run's trips. The best is kept only if the run beat it. A finished run has no
 * run left to resume, so its saved run is removed.
 */
export function recordFinishedRun(
  mode: PlayMode,
  mapId: string,
  trips: number,
): void {
  progress.best = recordRun(progress.best, mode, mapId, trips);
  delete progress.runs[bestKey(mode, mapId)];
  persist();
}

/** Saves a run in progress. The sim is copied, so later play does not change the save. */
export function saveRun(
  mode: PlayMode,
  mapId: string,
  mapHash: string,
  sim: SimState,
): void {
  progress.runs[bestKey(mode, mapId)] = {
    mode,
    mapId,
    mapHash,
    savedAt: new Date().toISOString(),
    sim: structuredClone(sim) as unknown as RunSave['sim'],
  };
  persist();
}

/** The saved run for a play, or null. The sim is a copy the game can change freely. */
export function loadRun(mode: PlayMode, mapId: string): SavedRun | null {
  const run = progress.runs[bestKey(mode, mapId)];
  if (!run) return null;
  return {
    mapHash: run.mapHash,
    savedAt: run.savedAt,
    sim: structuredClone(run.sim) as unknown as SimState,
  };
}

/** Removes a saved run, for example when its map has changed since it was saved. */
export function clearRun(mode: PlayMode, mapId: string): void {
  delete progress.runs[bestKey(mode, mapId)];
  persist();
}

/** The week of each saved campaign run, by map id, for the map select. */
export function savedWeeks(): Record<string, number> {
  const weeks: Record<string, number> = {};
  for (const run of Object.values(progress.runs)) {
    if (run.mode === 'campaign')
      weeks[run.mapId] = weekOf(Number(run.sim.tick));
  }
  return weeks;
}

/** The whole progress as a save bundle, for export. */
export function exportBundle(): SaveBundle {
  return structuredClone(bundleOf(progress));
}

/** Replaces the progress on this browser with an imported bundle. */
export function replaceProgress(bundle: SaveBundle): void {
  progress = progressFrom(structuredClone(bundle));
  persist();
}
