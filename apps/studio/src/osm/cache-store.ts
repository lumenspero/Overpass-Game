import { createStore, get, set } from 'idb-keyval';
import type { KeyValueStore } from './overpass.ts';

/** IndexedDB cache for Overpass replies, kept apart so the tests never open a database. */
const store = createStore('overpass_game_studio', 'osm-cache');

export const idbStore: KeyValueStore = {
  get: (key) => get(key, store),
  set: (key, value) => set(key, value, store),
};
