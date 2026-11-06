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
];
