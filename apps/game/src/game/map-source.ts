import { parseCompiledMap, type CompiledMap } from '@overpass-game/map-schema';

const MAP_ID = /^[a-z0-9-]+$/;

/**
 * The map id from a `?map=<id>` query, or null when there is none. The built-in test map
 * is the default, so `test` also reads as null.
 */
export function mapIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('map');
  if (id === null || id === 'test' || !MAP_ID.test(id)) return null;
  return id;
}

/** Loads a compiled map from the maps folder beside the game. */
export async function loadPlayableMap(
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<CompiledMap> {
  const res = await fetchFn(`maps/${id}.map.json`);
  if (!res.ok) throw new Error(`No map "${id}" in maps/ (HTTP ${res.status}).`);
  return parseCompiledMap(await res.json());
}
