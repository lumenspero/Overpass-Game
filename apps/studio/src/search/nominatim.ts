import { NOMINATIM_MIN_INTERVAL_MS } from '../config.ts';
import { createThrottle } from '../geo/throttle.ts';
import type { BBox } from '../geo/frame.ts';
import type { LonLat } from '../geo/mercator.ts';

export interface PlaceCandidate {
  /** Unique within one search: OSM type and id. */
  readonly id: string;
  readonly name: string;
  readonly centre: LonLat;
  readonly bbox: BBox | null;
}

type Json = unknown;

function asRecord(value: Json): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Reads Nominatim's jsonv2 search response. Entries without a usable point
 * are skipped rather than failing the whole search. Nominatim's boundingbox
 * is [south, north, west, east] as strings; BBox is [west, south, east, north].
 */
export function parseNominatimResults(json: Json): PlaceCandidate[] {
  if (!Array.isArray(json)) return [];
  const out: PlaceCandidate[] = [];
  for (const entry of json) {
    const rec = asRecord(entry);
    if (!rec) continue;
    const lon = Number(rec.lon);
    const lat = Number(rec.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    let bbox: BBox | null = null;
    if (Array.isArray(rec.boundingbox) && rec.boundingbox.length === 4) {
      const [south, north, west, east] = rec.boundingbox.map(Number);
      if ([south, north, west, east].every(Number.isFinite)) {
        bbox = [west, south, east, north] as const;
      }
    }

    const name =
      typeof rec.display_name === 'string'
        ? rec.display_name
        : `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    const id = `${String(rec.osm_type ?? 'place')}/${String(rec.osm_id ?? rec.place_id ?? out.length)}`;
    out.push({ id, name, centre: [lon, lat], bbox });
  }
  return out;
}

const throttled = createThrottle(NOMINATIM_MIN_INTERVAL_MS);

/**
 * Searches for a place through the Studio's dev proxy, which adds the
 * User-Agent. One request at a time, at most one per second.
 */
export function searchPlaces(query: string): Promise<PlaceCandidate[]> {
  const q = query.trim();
  if (q === '') return Promise.resolve([]);
  return throttled(async () => {
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: '8',
      countrycodes: 'us',
    });
    const res = await fetch(`/nominatim/search?${params.toString()}`);
    const body: Json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = asRecord(body)?.error;
      throw new Error(
        typeof message === 'string'
          ? message
          : `Search failed (HTTP ${res.status}).`,
      );
    }
    return parseNominatimResults(body);
  });
}
