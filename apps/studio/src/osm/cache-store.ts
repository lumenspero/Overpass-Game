import { idbGet, idbSet } from '../storage/idb.ts';
import type { KeyValueStore } from './overpass.ts';

/** The Overpass reply cache, kept in the Studio's IndexedDB apart from the drafts. */
export const idbStore: KeyValueStore = {
  get: (key) => idbGet('osm-cache', key),
  set: (key, value) => idbSet('osm-cache', key, value),
};
