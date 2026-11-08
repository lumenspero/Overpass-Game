import type { MapGate } from '@overpass-game/sim';

/**
 * A campaign map: its id (the compiled file in maps/ is `<id>.map.json`) and its name in the menu.
 * Its gate says how it opens. `openByDefault` opens it from the start. `unlockTrips` is the trips a
 * run on this map needs to unlock the map after it; a map with none takes the shared default.
 */
export interface CampaignMap extends MapGate {
  id: string;
  name: string;
}

/**
 * The campaign's maps in play order (spec: Campaign unlocks). The order is content, not a rule, so
 * it lives in the game. The first three maps are open by default; each later map unlocks once the
 * map before it has a run with that map's `unlockTrips`. Maps added by hand go at the end with
 * `openByDefault: true`; see the README section "Adding your own map".
 *
 * The unlockTrips values are approximated placeholders for the balance pass.
 */
export const CAMPAIGN_MAPS: readonly CampaignMap[] = [
  { id: 'tulsa-oklahoma-united-states', name: 'Tulsa', openByDefault: true },
  {
    id: 'los-angeles-los-angeles-county-california-united-states',
    name: 'Los Angeles',
    openByDefault: true,
  },
  {
    id: 'pierre-buckeye-township-hughes-county-south-dakota-57501-united-states',
    name: 'Pierre',
    openByDefault: true,
    unlockTrips: 500,
  },
  {
    id: 'seattle-king-county-washington-united-states',
    name: 'Seattle',
    unlockTrips: 500,
  },
  {
    id: 'chicago-south-chicago-township-cook-county-illinois-united-states',
    name: 'Chicago',
    unlockTrips: 500,
  },
  {
    id: 'san-francisco-california-united-states',
    name: 'San Francisco',
    unlockTrips: 500,
  },
  {
    id: 'santa-barbara-santa-barbara-county-california-united-states',
    name: 'Santa Barbara',
    unlockTrips: 500,
  },
  {
    id: 'duluth-saint-louis-county-minnesota-united-states',
    name: 'Duluth',
    unlockTrips: 500,
  },
  {
    id: 'burlington-chittenden-county-vermont-united-states',
    name: 'Burlington',
    unlockTrips: 500,
  },
  {
    id: 'portland-cumberland-county-maine-united-states',
    name: 'Portland',
    unlockTrips: 500,
  },
  {
    id: 'annapolis-anne-arundel-county-maryland-united-states',
    name: 'Annapolis',
    unlockTrips: 500,
  },
  {
    id: 'pittsburgh-allegheny-county-pennsylvania-united-states',
    name: 'Pittsburgh',
    unlockTrips: 500,
  },
  { id: 'denver-colorado-united-states', name: 'Denver', unlockTrips: 500 },
  {
    id: 'salt-lake-city-salt-lake-county-utah-united-states',
    name: 'Salt Lake City',
    unlockTrips: 500,
  },
  {
    id: 'flagstaff-coconino-county-arizona-united-states',
    name: 'Flagstaff',
    unlockTrips: 500,
  },
  {
    id: 'bend-deschutes-county-oregon-united-states',
    name: 'Bend',
    unlockTrips: 500,
  },
  {
    id: 'asheville-buncombe-county-north-carolina-united-states',
    name: 'Asheville',
    unlockTrips: 500,
  },
  {
    id: 'chattanooga-hamilton-county-east-tennessee-tennessee-united-states',
    name: 'Chattanooga',
    unlockTrips: 500,
  },
  { id: 'juneau-alaska-united-states', name: 'Juneau', unlockTrips: 500 },
  {
    id: 'ketchikan-ketchikan-gateway-borough-alaska-99901-united-states',
    name: 'Ketchikan',
    unlockTrips: 500,
  },
  { id: 'anchorage-alaska-united-states', name: 'Anchorage', unlockTrips: 500 },
  {
    id: 'honolulu-honolulu-county-hawaii-united-states',
    name: 'Honolulu',
    unlockTrips: 500,
  },
  {
    id: 'hilo-hawai-i-county-hawaii-96720-united-states',
    name: 'Hilo',
    unlockTrips: 500,
  },
];

/** The per-map gates the sim's `openCampaignMaps` reads, keyed by map id. */
export function campaignGates(
  maps: readonly CampaignMap[],
): Record<string, MapGate> {
  const gates: Record<string, MapGate> = {};
  for (const m of maps) {
    gates[m.id] = {
      ...(m.unlockTrips !== undefined ? { unlockTrips: m.unlockTrips } : {}),
      ...(m.openByDefault !== undefined
        ? { openByDefault: m.openByDefault }
        : {}),
    };
  }
  return gates;
}
