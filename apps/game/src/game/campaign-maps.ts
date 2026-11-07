/**
 * The campaign's maps in play order (spec: Campaign unlocks). The order is content, not a rule,
 * so it lives in the game. Until M14 supplies the 25 maps, the list holds only maps that exist.
 */
export interface CampaignMap {
  id: string;
  name: string;
}

export const CAMPAIGN_MAPS: readonly CampaignMap[] = [
  { id: 'tulsa-oklahoma-united-states', name: 'Tulsa' },
  {
    id: 'los-angeles-los-angeles-county-california-united-states',
    name: 'Los Angeles',
  },
  {
    id: 'pierre-buckeye-township-hughes-county-south-dakota-57501-united-states',
    name: 'Pierre',
  },
  {
    id: 'seattle-king-county-washington-united-states',
    name: 'Seattle',
  },
  {
    id: 'chicago-south-chicago-township-cook-county-illinois-united-states',
    name: 'Chicago',
  },
  {
    id: 'san-francisco-california-united-states',
    name: 'San Francisco',
  },
  {
    id: 'santa-barbara-santa-barbara-county-california-united-states',
    name: 'Santa Barbara',
  },
  {
    id: 'duluth-saint-louis-county-minnesota-united-states',
    name: 'Duluth',
  },
  {
    id: 'burlington-chittenden-county-vermont-united-states',
    name: 'Burlington',
  },
  {
    id: 'portland-cumberland-county-maine-united-states',
    name: 'Portland',
  },
  {
    id: 'annapolis-anne-arundel-county-maryland-united-states',
    name: 'Annapolis',
  },
  {
    id: 'pittsburgh-allegheny-county-pennsylvania-united-states',
    name: 'Pittsburgh',
  },
  {
    id: 'denver-colorado-united-states',
    name: 'Denver',
  },
  {
    id: 'salt-lake-city-salt-lake-county-utah-united-states',
    name: 'Salt Lake City',
  },
  {
    id: 'flagstaff-coconino-county-arizona-united-states',
    name: 'Flagstaff',
  },
  {
    id: 'bend-deschutes-county-oregon-united-states',
    name: 'Bend',
  },
  {
    id: 'asheville-buncombe-county-north-carolina-united-states',
    name: 'Asheville',
  },
  {
    id: 'chattanooga-hamilton-county-east-tennessee-tennessee-united-states',
    name: 'Chattanooga',
  },
  {
    id: 'juneau-alaska-united-states',
    name: 'Juneau',
  },
  {
    id: 'ketchikan-ketchikan-gateway-borough-alaska-99901-united-states',
    name: 'Ketchikan',
  },
  {
    id: 'anchorage-alaska-united-states',
    name: 'Anchorage',
  },
  {
    id: 'honolulu-honolulu-county-hawaii-united-states',
    name: 'Honolulu',
  },
  {
    id: 'hilo-hawai-i-county-hawaii-96720-united-states',
    name: 'Hilo',
  },
];
