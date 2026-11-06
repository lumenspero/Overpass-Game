// Every gameplay number lives in this file. Each one is documented in
// docs/mechanics-spec.md with a tag (approximated | tuned | confirmed).

/** Speed multipliers the player can choose. Not tunable from the debug panel. */
export const SPEED_OPTIONS = [1, 2, 4, 8] as const; // approximated

/**
 * Every tunable number, with its starting value. The sim reads `tuning` (below) each
 * time it needs a value, so the debug panel can change them while the game runs.
 */
export const DEFAULT_TUNING = {
  /** Fixed simulation rate. Real time is converted into whole ticks at this rate. */
  TICKS_PER_SECOND: 30, // approximated
  /** Upper bound on ticks run for one frame, so a long stall can't freeze the game. */
  MAX_CATCHUP_TICKS: 15, // approximated
  /** Road tiles the player can place before the first weekly reward. */
  ROAD_BUDGET_START: 120, // approximated
  /** Number of building colours. A house pairs with destinations of its own colour. */
  BUILDING_COLOR_COUNT: 4, // approximated
  /** How far a car travels along its route per second, in tiles. */
  CAR_SPEED: 2, // approximated
  /** Least distance, in tiles, between a car and the car ahead of it on the same tile. */
  CAR_GAP: 0.4, // approximated
  /** A road tile with at least this many road neighbours is a junction. One car at a time may cross it. */
  JUNCTION_MIN_ROADS: 3, // approximated
  /** Cars each house owns when it is placed. */
  CARS_PER_HOUSE: 2, // approximated
  /** Ticks between one car leaving a house and the next. */
  SPAWN_INTERVAL_TICKS: 60, // approximated
  /** Ticks a car stays parked at its destination before driving home. */
  PARK_TICKS: 60, // approximated
  /** Ticks between one demand pin appearing at a destination and the next. */
  DEMAND_INTERVAL_TICKS: 150, // approximated
  /** Ticks between pins at a square destination, which is slower than a round one. */
  DEMAND_INTERVAL_SQUARE_TICKS: 300, // approximated
  /** Businesses arrive square before this week. From it on, an arrival may be round, or level up a square one. */
  SHAPE_SWITCH_WEEK: 10, // approximated
  /** Waiting pins a destination holds at most. A request arriving while this many wait starts its overflow pin. */
  OVERFLOW_PIN_LIMIT: 9, // approximated
  /** The overflow pin fills in the time this many more requests would take to arrive; a trip drains one of them. */
  OVERFLOW_FILL_PINS: 9, // approximated
  /** Ticks in one week. The clock counts weeks; the first week is week 1. */
  WEEK_TICKS: 2700, // approximated: 90 seconds at 1x (30 ticks a second)
  /** Nodes the fence grows on each side every week (spec: Expansion). Growth lands one node a side at a time, spread across the week. */
  FENCE_GROWTH_PER_WEEK: 2, // approximated
  /** Ticks a fence edge takes to slide across its strip before the tiles open (spec: Expansion). */
  FENCE_REVEAL_TICKS: 45, // approximated: 1.5 seconds at 1x
  /** The starting destination lies at least this many tiles (Chebyshev) from the starting house (spec: Starting pair). */
  START_PAIR_MIN_TILES: 5, // approximated
  /** ...and at most this many (spec: Starting pair). */
  START_PAIR_MAX_TILES: 10, // approximated
  /** Relative chance each upgrade kind is offered. Zero means never offered (spec: Upgrades). */
  UPGRADE_WEIGHT_BRIDGE: 1, // approximated
  UPGRADE_WEIGHT_TUNNEL: 1, // approximated
  UPGRADE_WEIGHT_MOTORWAY: 1, // approximated
  UPGRADE_WEIGHT_ROUNDABOUT: 1, // approximated
  UPGRADE_WEIGHT_LIGHT: 1, // approximated
  UPGRADE_WEIGHT_TILES: 1, // approximated
  /** Most water tiles a bridge may span between its two banks (spec: Bridges and tunnels). */
  BRIDGE_MAX_SPAN: 3, // approximated
  /** Most mountain tiles a tunnel may run through (spec: Bridges and tunnels). */
  TUNNEL_MAX_SPAN: 4, // approximated
  MOTORWAY_MAX_NODES: 4, // approximated
  MOTORWAY_MAX_LENGTH: 30, // approximated
  MOTORWAY_COST_PER_TILE: 1, // approximated
  MOTORWAY_SPEED: 2.5, // approximated
  /** Most cars a roundabout holds at once. A plain junction holds one (spec: Roundabouts and lights). */
  ROUNDABOUT_CAPACITY: 3, // approximated
  /** Shortest a light's green lasts before it may switch (spec: Roundabouts and lights). */
  LIGHT_MIN_GREEN_TICKS: 60, // approximated
  /** Longest a light keeps its green while cars wait on the red side. */
  LIGHT_MAX_GREEN_TICKS: 240, // approximated
  /** How many tiles ahead of a light it sees cars coming: the car at it and the one behind. */
  LIGHT_SENSE_TILES: 2, // approximated
  /** Extra route cost, in tile steps, for each car waiting to enter a tile (spec: Congestion-aware routing). */
  CONGESTION_COST_PER_CAR: 1.5, // approximated
  /** Demand each destination gains every week, so demand rises as the game goes on. */
  DEMAND_GROWTH_STEP: 0.1, // approximated
  /** Chance a destination placed with a roll gets a double lot, before the inflection week (spec: Parking lots). */
  DOUBLE_LOT_CHANCE_EARLY: 0.1, // approximated
  /** Chance a destination placed with a roll gets a double lot, from the inflection week on. */
  DOUBLE_LOT_CHANCE_LATE: 0.2, // approximated
  /** Inflection week: from here on, double buildings spawn more often (at the later chance). */
  DOUBLE_LOT_WEEK: 4, // approximated
  /** Weeks after a double lot spawns before its second building is filled in, if its far half is clear. */
  SECOND_BUILDING_DELAY_WEEKS: 6, // approximated
  /** From this week, businesses arrive in the fence, once the week's reward is chosen. */
  BUSINESS_ARRIVAL_START_WEEK: 2, // approximated
  /** New businesses arriving each week. */
  BUSINESS_ARRIVALS_PER_WEEK: 1, // approximated
  /** Every this many weeks, extra businesses arrive (weeks 10, 20, ...). */
  BUSINESS_BONUS_EVERY_WEEKS: 10, // approximated
  /** Extra businesses arriving in a bonus week. */
  BUSINESS_BONUS_ARRIVALS: 1, // approximated
  /** From SHAPE_SWITCH_WEEK, the chance an arrival is a new round business. */
  ARRIVAL_ROUND_CHANCE: 0.25, // approximated
  /** From SHAPE_SWITCH_WEEK, the chance an arrival levels up a square business to round instead of adding one. */
  ARRIVAL_LEVEL_UP_CHANCE: 0.25, // approximated
  /** Fewest moments in a week when houses are topped up. */
  HOUSE_MOMENTS_MIN: 1, // approximated
  /** Most moments in a week when houses are topped up. */
  HOUSE_MOMENTS_MAX: 2, // approximated
  /** Houses per business below which a colour gets more houses (never fewer than this). */
  SUPPLY_RATIO_MIN: 2, // approximated
  /** Houses per business a colour is topped up to. Houses are never added above this. */
  SUPPLY_RATIO_MAX: 3, // approximated
  /** A new house spawns within this many tiles of a road (Chebyshev distance). */
  HOUSE_ROAD_REACH: 5, // approximated
  /** Or within this many tiles of a building. */
  HOUSE_BUILDING_REACH: 10, // approximated
  /** Trips a campaign run must reach to unlock the next map (spec: Campaign unlocks). */
  CAMPAIGN_UNLOCK_TRIPS: 20, // approximated
};

export type Tuning = typeof DEFAULT_TUNING;
export type TuningKey = keyof Tuning;

/** The live values the sim reads. Starts as a copy of the defaults. */
export const tuning: Tuning = { ...DEFAULT_TUNING };

/** Puts every tunable value back to its default. */
export function resetTuning(): void {
  Object.assign(tuning, DEFAULT_TUNING);
}

// Named defaults, for tests and docs. Code in src/ reads `tuning`, not these.
export const TICKS_PER_SECOND = DEFAULT_TUNING.TICKS_PER_SECOND;
export const MAX_CATCHUP_TICKS = DEFAULT_TUNING.MAX_CATCHUP_TICKS;
export const ROAD_BUDGET_START = DEFAULT_TUNING.ROAD_BUDGET_START;
export const BUILDING_COLOR_COUNT = DEFAULT_TUNING.BUILDING_COLOR_COUNT;
export const CAR_SPEED = DEFAULT_TUNING.CAR_SPEED;
export const CAR_GAP = DEFAULT_TUNING.CAR_GAP;
export const JUNCTION_MIN_ROADS = DEFAULT_TUNING.JUNCTION_MIN_ROADS;
export const CARS_PER_HOUSE = DEFAULT_TUNING.CARS_PER_HOUSE;
export const SPAWN_INTERVAL_TICKS = DEFAULT_TUNING.SPAWN_INTERVAL_TICKS;
export const PARK_TICKS = DEFAULT_TUNING.PARK_TICKS;
export const DEMAND_INTERVAL_TICKS = DEFAULT_TUNING.DEMAND_INTERVAL_TICKS;
export const OVERFLOW_PIN_LIMIT = DEFAULT_TUNING.OVERFLOW_PIN_LIMIT;
export const OVERFLOW_FILL_PINS = DEFAULT_TUNING.OVERFLOW_FILL_PINS;
export const WEEK_TICKS = DEFAULT_TUNING.WEEK_TICKS;
export const FENCE_GROWTH_PER_WEEK = DEFAULT_TUNING.FENCE_GROWTH_PER_WEEK;
export const FENCE_REVEAL_TICKS = DEFAULT_TUNING.FENCE_REVEAL_TICKS;
export const START_PAIR_MIN_TILES = DEFAULT_TUNING.START_PAIR_MIN_TILES;
export const START_PAIR_MAX_TILES = DEFAULT_TUNING.START_PAIR_MAX_TILES;
export const UPGRADE_WEIGHT_BRIDGE = DEFAULT_TUNING.UPGRADE_WEIGHT_BRIDGE;
export const UPGRADE_WEIGHT_TUNNEL = DEFAULT_TUNING.UPGRADE_WEIGHT_TUNNEL;
export const UPGRADE_WEIGHT_MOTORWAY = DEFAULT_TUNING.UPGRADE_WEIGHT_MOTORWAY;
export const UPGRADE_WEIGHT_ROUNDABOUT =
  DEFAULT_TUNING.UPGRADE_WEIGHT_ROUNDABOUT;
export const UPGRADE_WEIGHT_LIGHT = DEFAULT_TUNING.UPGRADE_WEIGHT_LIGHT;
export const UPGRADE_WEIGHT_TILES = DEFAULT_TUNING.UPGRADE_WEIGHT_TILES;
export const BRIDGE_MAX_SPAN = DEFAULT_TUNING.BRIDGE_MAX_SPAN;
export const TUNNEL_MAX_SPAN = DEFAULT_TUNING.TUNNEL_MAX_SPAN;
export const MOTORWAY_MAX_NODES = DEFAULT_TUNING.MOTORWAY_MAX_NODES;
export const MOTORWAY_MAX_LENGTH = DEFAULT_TUNING.MOTORWAY_MAX_LENGTH;
export const MOTORWAY_COST_PER_TILE = DEFAULT_TUNING.MOTORWAY_COST_PER_TILE;
export const MOTORWAY_SPEED = DEFAULT_TUNING.MOTORWAY_SPEED;
export const ROUNDABOUT_CAPACITY = DEFAULT_TUNING.ROUNDABOUT_CAPACITY;
export const LIGHT_MIN_GREEN_TICKS = DEFAULT_TUNING.LIGHT_MIN_GREEN_TICKS;
export const LIGHT_MAX_GREEN_TICKS = DEFAULT_TUNING.LIGHT_MAX_GREEN_TICKS;
export const CONGESTION_COST_PER_CAR = DEFAULT_TUNING.CONGESTION_COST_PER_CAR;
export const CAMPAIGN_UNLOCK_TRIPS = DEFAULT_TUNING.CAMPAIGN_UNLOCK_TRIPS;

/** Ticks between pins at a destination of this shape. Square is the slower of the two. */
export function demandIntervalFor(
  shape: 'square' | 'round' | undefined,
): number {
  return shape === 'square'
    ? tuning.DEMAND_INTERVAL_SQUARE_TICKS
    : tuning.DEMAND_INTERVAL_TICKS;
}
