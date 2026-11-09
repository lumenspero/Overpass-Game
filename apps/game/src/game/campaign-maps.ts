import type { MapGate } from '@overpass-game/sim';

/**
 * A campaign map: its id (the compiled file in maps/ is `<id>.map.json`), its name in the menu, and a
 * short line about the place for its card (at most DESCRIPTION_MAX characters).
 * Its gate says how it opens. `openByDefault` opens it from the start. `unlockTrips` is the trips a
 * run on this map needs to unlock the map after it; a map with none takes the shared default.
 */
export interface CampaignMap extends MapGate {
  id: string;
  name: string;
  /** Optional for a map added by hand; every shipped map has one. */
  description?: string;
}

/** The longest a map's description may be, so it fits its card on two short lines. */
export const DESCRIPTION_MAX = 48;

/**
 * The campaign's maps in play order (spec: Campaign unlocks). The order is content, not a rule, so
 * it lives in the game. The first three maps are open by default; each later map unlocks once the
 * map before it has a run with that map's `unlockTrips`. Maps added by hand go at the end with
 * `openByDefault: true`; see the README section "Adding your own map".
 *
 * The unlockTrips values are approximated placeholders for the balance pass.
 */
export const CAMPAIGN_MAPS: readonly CampaignMap[] = [
  {
    id: 'tulsa-oklahoma-united-states',
    name: 'Tulsa',
    description: 'Oil capital on the Arkansas River',
    openByDefault: true,
  },
  {
    id: 'los-angeles-los-angeles-county-california-united-states',
    name: 'Los Angeles',
    description: 'Freeway city on the Pacific',
    openByDefault: true,
  },
  {
    id: 'pierre-buckeye-township-hughes-county-south-dakota-57501-united-states',
    name: 'Pierre',
    description: 'A small capital on the Missouri',
    openByDefault: true,
    unlockTrips: 500,
  },
  {
    id: 'seattle-king-county-washington-united-states',
    name: 'Seattle',
    description: 'The Emerald City, between sound and lake',
    unlockTrips: 500,
  },
  {
    id: 'chicago-south-chicago-township-cook-county-illinois-united-states',
    name: 'Chicago',
    description: 'The Windy City on Lake Michigan',
    unlockTrips: 500,
  },
  {
    id: 'san-francisco-california-united-states',
    name: 'San Francisco',
    description: 'Hills and fog at the Golden Gate',
    unlockTrips: 500,
  },
  {
    id: 'santa-barbara-santa-barbara-county-california-united-states',
    name: 'Santa Barbara',
    description: 'Red roofs between mountains and sea',
    unlockTrips: 500,
  },
  {
    id: 'duluth-saint-louis-county-minnesota-united-states',
    name: 'Duluth',
    description: 'Harbour town at the head of Lake Superior',
    unlockTrips: 500,
  },
  {
    id: 'burlington-chittenden-county-vermont-united-states',
    name: 'Burlington',
    description: 'College town on Lake Champlain',
    unlockTrips: 500,
  },
  {
    id: 'portland-cumberland-county-maine-united-states',
    name: 'Portland',
    description: 'An old port on Casco Bay',
    unlockTrips: 500,
  },
  {
    id: 'annapolis-anne-arundel-county-maryland-united-states',
    name: 'Annapolis',
    description: 'Sailing capital on the Chesapeake',
    unlockTrips: 500,
  },
  {
    id: 'pittsburgh-allegheny-county-pennsylvania-united-states',
    name: 'Pittsburgh',
    description: 'Steel city where three rivers meet',
    unlockTrips: 500,
  },
  {
    id: 'denver-colorado-united-states',
    name: 'Denver',
    description: 'The Mile High City, below the Rockies',
    unlockTrips: 500,
  },
  {
    id: 'salt-lake-city-salt-lake-county-utah-united-states',
    name: 'Salt Lake City',
    description: 'A wide grid under the Wasatch Range',
    unlockTrips: 500,
  },
  {
    id: 'flagstaff-coconino-county-arizona-united-states',
    name: 'Flagstaff',
    description: 'Pine country on Route 66',
    unlockTrips: 500,
  },
  {
    id: 'bend-deschutes-county-oregon-united-states',
    name: 'Bend',
    description: 'High desert town on the Deschutes',
    unlockTrips: 500,
  },
  {
    id: 'asheville-buncombe-county-north-carolina-united-states',
    name: 'Asheville',
    description: 'Blue Ridge town on the French Broad',
    unlockTrips: 500,
  },
  {
    id: 'chattanooga-hamilton-county-east-tennessee-tennessee-united-states',
    name: 'Chattanooga',
    description: 'A bend in the Tennessee River',
    unlockTrips: 500,
  },
  {
    id: 'juneau-alaska-united-states',
    name: 'Juneau',
    description: 'A capital with no road out',
    unlockTrips: 500,
  },
  {
    id: 'ketchikan-ketchikan-gateway-borough-alaska-99901-united-states',
    name: 'Ketchikan',
    description: 'Salmon town on a narrow shore',
    unlockTrips: 500,
  },
  {
    id: 'anchorage-alaska-united-states',
    name: 'Anchorage',
    description: "Alaska's largest city, on Cook Inlet",
    unlockTrips: 500,
  },
  {
    id: 'honolulu-honolulu-county-hawaii-united-states',
    name: 'Honolulu',
    description: 'Island capital beside Diamond Head',
    unlockTrips: 500,
  },
  {
    id: 'hilo-hawai-i-county-hawaii-96720-united-states',
    name: 'Hilo',
    description: 'Rainy bay town below Mauna Kea',
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
