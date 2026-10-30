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
