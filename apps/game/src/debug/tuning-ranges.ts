import type { TuningKey } from '@overpass-game/sim';

/**
 * Slider ranges for the debug panel. Typed over every tunable key, so a value added to
 * config.ts can't be left out of the panel.
 */

export interface TuningRange {
  min: number;
  max: number;
  step: number;
}

export const TUNING_RANGES: Record<TuningKey, TuningRange> = {
  TICKS_PER_SECOND: { min: 10, max: 60, step: 1 },
  MAX_CATCHUP_TICKS: { min: 1, max: 60, step: 1 },
  ROAD_BUDGET_START: { min: 0, max: 500, step: 10 },
  BUILDING_COLOR_COUNT: { min: 1, max: 4, step: 1 },
  CAR_SPEED: { min: 0.5, max: 6, step: 0.1 },
  CAR_GAP: { min: 0, max: 1, step: 0.05 },
  JUNCTION_MIN_ROADS: { min: 2, max: 4, step: 1 },
  CARS_PER_HOUSE: { min: 1, max: 6, step: 1 },
  SPAWN_INTERVAL_TICKS: { min: 10, max: 300, step: 5 },
  PARK_TICKS: { min: 0, max: 300, step: 5 },
  DOUBLE_LOT_CHANCE_EARLY: { min: 0, max: 1, step: 0.05 },
  DOUBLE_LOT_CHANCE_LATE: { min: 0, max: 1, step: 0.05 },
  DOUBLE_LOT_WEEK: { min: 1, max: 20, step: 1 },
  SECOND_BUILDING_DELAY_WEEKS: { min: 1, max: 20, step: 1 },
  DEMAND_INTERVAL_TICKS: { min: 10, max: 600, step: 10 },
  DEMAND_INTERVAL_SQUARE_TICKS: { min: 10, max: 600, step: 10 },
  SHAPE_SWITCH_WEEK: { min: 1, max: 20, step: 1 },
  OVERFLOW_PIN_LIMIT: { min: 0, max: 12, step: 1 },
  OVERFLOW_TICKS: { min: 30, max: 3000, step: 30 },
  WEEK_TICKS: { min: 300, max: 7200, step: 60 },
  FENCE_GROWTH_PER_WEEK: { min: 0, max: 6, step: 1 },
  FENCE_REVEAL_TICKS: { min: 1, max: 300, step: 1 },
  START_PAIR_MIN_TILES: { min: 1, max: 30, step: 1 },
  START_PAIR_MAX_TILES: { min: 1, max: 40, step: 1 },
  UPGRADE_WEIGHT_BRIDGE: { min: 0, max: 5, step: 1 },
  UPGRADE_WEIGHT_TUNNEL: { min: 0, max: 5, step: 1 },
  UPGRADE_WEIGHT_MOTORWAY: { min: 0, max: 5, step: 1 },
  UPGRADE_WEIGHT_ROUNDABOUT: { min: 0, max: 5, step: 1 },
  UPGRADE_WEIGHT_LIGHT: { min: 0, max: 5, step: 1 },
  UPGRADE_WEIGHT_TILES: { min: 0, max: 5, step: 1 },
  BRIDGE_MAX_SPAN: { min: 1, max: 8, step: 1 },
  TUNNEL_MAX_SPAN: { min: 1, max: 8, step: 1 },
  MOTORWAY_MAX_NODES: { min: 0, max: 8, step: 1 },
  MOTORWAY_MAX_LENGTH: { min: 4, max: 60, step: 1 },
  MOTORWAY_COST_PER_TILE: { min: 0, max: 3, step: 0.5 },
  MOTORWAY_SPEED: { min: 1, max: 5, step: 0.5 },
  ROUNDABOUT_CAPACITY: { min: 1, max: 8, step: 1 },
  LIGHT_GREEN_TICKS: { min: 30, max: 600, step: 30 },
  CONGESTION_COST_PER_CAR: { min: 0, max: 5, step: 0.5 },
  DEMAND_GROWTH_STEP: { min: 0, max: 1, step: 0.25 },
  CAMPAIGN_UNLOCK_TRIPS: { min: 0, max: 200, step: 5 },
};
