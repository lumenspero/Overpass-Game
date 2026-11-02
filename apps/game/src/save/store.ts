import { createStore, get, set } from 'idb-keyval';

/**
 * Named records the game keeps. Values are plain data: they are copied on the way in and out, so
 * a record can't change after it is written.
 */
export interface RecordStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

/** Keeps records in memory. Used when browser storage is blocked, and in tests. */
export function memoryStore(): RecordStore {
  const records = new Map<string, unknown>();
  return {
    async get(key) {
      return records.has(key) ? structuredClone(records.get(key)) : undefined;
    },
    async set(key, value) {
      records.set(key, structuredClone(value));
    },
  };
}

/** Records in IndexedDB, through idb-keyval. Fails when IndexedDB is missing or blocked. */
export function indexedStore(name = 'overpass-game'): RecordStore {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this browser');
  }
  const db = createStore(name, 'records');
  return {
    get: (key) => get(key, db),
    set: (key, value) => set(key, value, db),
  };
}

/**
 * Wraps a primary store. If it fails on a read or a write, the wrapper switches to memory for the
 * rest of the page's life and calls `onFallback` once, so the game keeps running and says so.
 */
export function fallbackStore(
  primary: RecordStore,
  onFallback: (reason: unknown) => void,
): RecordStore {
  let memory: RecordStore | null = null;
  const active = (): RecordStore => memory ?? primary;
  const fall = (reason: unknown): void => {
    if (memory) return;
    memory = memoryStore();
    onFallback(reason);
  };
  return {
    async get(key) {
      try {
        return await active().get(key);
      } catch (err) {
        fall(err);
        return active().get(key);
      }
    },
    async set(key, value) {
      try {
        await active().set(key, value);
      } catch (err) {
        fall(err);
        await active().set(key, value);
      }
    },
  };
}

/** Rejects if `promise` does not settle within `ms`. A blocked IndexedDB open can wait forever. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('storage did not answer in time')),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
