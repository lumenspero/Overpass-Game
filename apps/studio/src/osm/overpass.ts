import { contentHash } from '@overpass-game/map-compiler';
import { OVERPASS_PATH } from '../../dev/overpass-proxy.ts';

/** The part of an Overpass JSON reply the import relies on. */
export interface OverpassResponse {
  readonly elements: readonly unknown[];
}

/** Anything that can store and fetch a value by key. IndexedDB in the Studio; a Map in tests. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface LoadedRegion {
  readonly hash: string;
  readonly cached: boolean;
  readonly data: OverpassResponse;
}

export function isOverpassResponse(value: unknown): value is OverpassResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { elements?: unknown }).elements)
  );
}

/**
 * Returns the reply for a query. A cached reply is used when one exists for the
 * same query text; otherwise the query is sent and the reply is stored.
 */
export async function loadOverpass(
  query: string,
  store: KeyValueStore,
  send: (query: string) => Promise<unknown>,
): Promise<LoadedRegion> {
  const hash = contentHash(query);
  const key = `overpass:${hash}`;
  const hit = await store.get(key);
  if (isOverpassResponse(hit)) return { hash, cached: true, data: hit };

  const reply = await send(query);
  if (!isOverpassResponse(reply))
    throw new Error('Overpass returned an unexpected reply.');
  await store.set(key, reply);
  return { hash, cached: false, data: reply };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Sends a query through the Studio's dev proxy. */
export async function sendOverpass(query: string): Promise<unknown> {
  const res = await fetch(`${OVERPASS_PATH}/api/interpreter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }),
  });
  const body = parseJson(await res.text());
  if (!res.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Overpass failed (HTTP ${res.status}). Try again in a minute, or use a smaller frame.`;
    throw new Error(message);
  }
  if (body === null)
    throw new Error('Overpass sent back something that is not JSON.');
  return body;
}
