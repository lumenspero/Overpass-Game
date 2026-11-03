/**
 * The Studio's IndexedDB: one database holding every Studio store (drafts, the Overpass cache).
 *
 * idb-keyval creates a store only when its database is first made, so a second store added later
 * on an existing database never appears, and its transactions fail with "object store not found".
 * This opener checks every store on connect and, if one is missing, reopens the database one
 * version up to create it. Existing stores and their data are kept.
 */

const DB_NAME = 'overpass_game_studio';

/** Every store the Studio uses. Add a name here when a new store is needed. */
export const STUDIO_STORES = ['drafts', 'osm-cache'] as const;
export type StudioStore = (typeof STUDIO_STORES)[number];

function open(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req =
      version === undefined
        ? indexedDB.open(DB_NAME)
        : indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STUDIO_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () =>
      reject(new Error('The Studio database is open in another tab.'));
  });
}

async function connect(): Promise<IDBDatabase> {
  const first = await open();
  const complete = STUDIO_STORES.every((name) =>
    first.objectStoreNames.contains(name),
  );
  if (complete) return first;
  const next = first.version + 1;
  first.close();
  return open(next);
}

let connection: Promise<IDBDatabase> | null = null;

/** The one shared connection. Dropped if another tab upgrades the database, then reopened. */
function database(): Promise<IDBDatabase> {
  connection ??= connect().then(
    (db) => {
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      return db;
    },
    (err: unknown) => {
      // A failed open is not kept, so the next call tries again.
      connection = null;
      throw err;
    },
  );
  return connection;
}

function run<T>(
  name: StudioStore,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(name, mode);
        const req = op(tx.objectStore(name));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB error'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'));
      }),
  );
}

export function idbGet(store: StudioStore, key: string): Promise<unknown> {
  return run(store, 'readonly', (s) => s.get(key));
}

export function idbSet(
  store: StudioStore,
  key: string,
  value: unknown,
): Promise<void> {
  return run(store, 'readwrite', (s) => s.put(value, key)).then(
    () => undefined,
  );
}

export function idbDelete(store: StudioStore, key: string): Promise<void> {
  return run(store, 'readwrite', (s) => s.delete(key)).then(() => undefined);
}

/** Every key in the store. Non-string keys are dropped; the Studio only writes string keys. */
export function idbKeys(store: StudioStore): Promise<string[]> {
  return run(store, 'readonly', (s) => s.getAllKeys()).then((keys) =>
    keys.filter((k): k is string => typeof k === 'string'),
  );
}
