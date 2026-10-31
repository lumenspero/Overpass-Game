import osmtogeojson from 'osmtogeojson';
import { frameBBox, type Frame } from '../geo/frame.ts';
import { idbStore } from './cache-store.ts';
import { buildQuery } from './query.ts';
import { loadOverpass, sendOverpass, type LoadedRegion } from './overpass.ts';

export interface LoadedGeoJson {
  readonly hash: string;
  readonly cached: boolean;
  readonly collection: ReturnType<typeof osmtogeojson>;
}

/** Fetches (or reads from the cache) the OSM features inside a frame, as GeoJSON. */
export async function loadRegion(frame: Frame): Promise<LoadedGeoJson> {
  const region: LoadedRegion = await loadOverpass(
    buildQuery(frameBBox(frame)),
    idbStore,
    sendOverpass,
  );
  const collection = osmtogeojson(
    region.data as Parameters<typeof osmtogeojson>[0],
  );
  return { hash: region.hash, cached: region.cached, collection };
}
