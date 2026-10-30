// Every gameplay number lives in this file. Each one is documented in
// docs/mechanics-spec.md with a tag (approximated | tuned | confirmed).

/** Fixed simulation rate. Real time is converted into whole ticks at this rate. */
export const TICKS_PER_SECOND = 30; // approximated

/** Speed multipliers the player can choose. */
export const SPEED_OPTIONS = [1, 2, 4, 8] as const; // approximated

/** Upper bound on ticks run for one frame, so a long stall can't freeze the game. */
export const MAX_CATCHUP_TICKS = 15; // approximated

/** Road tiles the player can place before the first weekly reward. */
export const ROAD_BUDGET_START = 120; // approximated

/** Number of building colours. A house pairs with destinations of its own colour. */
export const BUILDING_COLOR_COUNT = 4; // approximated

/** How far a car travels along its route per second, in tiles. */
export const CAR_SPEED = 2; // approximated

/** Least distance, in tiles, between a car and the car ahead of it on the same tile. */
export const CAR_GAP = 0.4; // approximated

/** A road tile with at least this many road neighbours is a junction. One car at a time may cross it. */
export const JUNCTION_MIN_ROADS = 3; // approximated

/** Cars each house owns when it is placed. */
export const CARS_PER_HOUSE = 2; // approximated

/** Ticks between one car leaving a house and the next. */
export const SPAWN_INTERVAL_TICKS = 60; // approximated

/** Ticks a car stays parked at its destination before driving home. */
export const PARK_TICKS = 60; // approximated

/** Ticks between one demand pin appearing at a destination and the next. */
export const DEMAND_INTERVAL_TICKS = 150; // approximated
