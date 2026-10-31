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
  DEMAND_INTERVAL_TICKS: { min: 10, max: 600, step: 10 },
  OVERFLOW_PIN_LIMIT: { min: 0, max: 12, step: 1 },
  OVERFLOW_TICKS: { min: 30, max: 3000, step: 30 },
  WEEK_TICKS: { min: 300, max: 7200, step: 60 },
  EXPANSION_WEEK_1: { min: 1, max: 52, step: 1 },
  EXPANSION_WEEK_2: { min: 1, max: 52, step: 1 },
  EXPANSION_WEEK_3: { min: 1, max: 52, step: 1 },
  WEEKLY_ROAD_REWARD: { min: 0, max: 100, step: 5 },
  UPGRADE_WEIGHT_BRIDGE: { min: 0, max: 5, step: 1 },
  UPGRADE_WEIGHT_TUNNEL: { min: 0, max: 5, step: 1 },
  UPGRADE_WEIGHT_MOTORWAY: { min: 0, max: 5, step: 1 },
  UPGRADE_WEIGHT_ROUNDABOUT: { min: 0, max: 5, step: 1 },
  UPGRADE_WEIGHT_LIGHT: { min: 0, max: 5, step: 1 },
  BRIDGE_MAX_SPAN: { min: 1, max: 8, step: 1 },
  TUNNEL_MAX_SPAN: { min: 1, max: 8, step: 1 },
  MOTORWAY_MAX_NODES: { min: 0, max: 8, step: 1 },
  MOTORWAY_MAX_LENGTH: { min: 4, max: 60, step: 1 },
  MOTORWAY_COST_PER_TILE: { min: 0, max: 3, step: 0.5 },
  MOTORWAY_SPEED: { min: 1, max: 5, step: 0.5 },
  ROUNDABOUT_CAPACITY: { min: 1, max: 8, step: 1 },
  LIGHT_GREEN_TICKS: { min: 30, max: 600, step: 30 },
  CONGESTION_COST_PER_CAR: { min: 0, max: 5, step: 0.5 },
};
