# Mechanics spec

Every rule and constant in Overpass_Game. Each entry carries one tag:

- `approximated` — first-pass value, not yet playtested
- `tuned` — adjusted at a checkpoint
- `confirmed` — signed off at a checkpoint

Gameplay numbers live in `packages/sim/src/config.ts`; this file documents them.

## Sections

### Clock and time

- **Tick rate:** 30 ticks per second of game time, `TICKS_PER_SECOND` in `config.ts`. `approximated`
- **Speeds:** 1×, 2×, 4×, 8×. Pausing stops ticks without losing time. `approximated`
- **Catch-up cap:** at most 15 ticks run for one frame, so a stall can't freeze the game. `MAX_CATCHUP_TICKS`. `approximated`

### Grid and terrain

- **Grid:** tiles in a rectangle, stored row by row. Tiles outside the grid are not playable.
- **Terrain kinds:** land, water, mountain, park, out-of-bounds.
- **Buildable:** roads may be placed on land and parks. Water and mountains block roads until M5 (bridges and tunnels). `approximated`

### Roads and road graph

- **Adjacency:** two road tiles connect when they share an edge or a corner. A corner link is a diagonal road. Roads have no separate connection points. `approximated`
- **Graph nodes:** dead ends, junctions, isolated road tiles, and one representative tile for any closed loop with no node.
- **Graph edges:** chains of pass-through road tiles between nodes. Each edge stores its interior tiles and its length in steps (interior tiles + 1).
- **Updates:** after a change, only the connected road components next to the changed tiles are rebuilt. The result always matches a full rebuild. Tested with 500 random edits per seed.

### Road budget

- **Starting budget:** 120 road tiles, `ROAD_BUDGET_START`. `approximated`
- **Cost:** each newly placed road tile costs 1. Tiles that already have a road cost nothing.
- **Refund:** removing a road tile refunds 1.
- **Placement is all or nothing:** if the whole path doesn't fit in the budget, nothing is placed.
- **Weekly reward:** not yet implemented (M5).

### Cars and routing

- **Routes:** a car's route is the list of road tiles from where it is to where it is going, both ends included. Routes step between road tiles that share an edge or a corner. An edge step costs 1 tile and a corner step costs √2. Routes are shortest by that cost. `approximated`
- **Planning:** A* over road tiles, every step costs 1, Manhattan distance as the estimate. Ties go to the lower tile index, so the same roads always give the same route. `approximated`
- **Car states (M3):** driving to a destination, or returning to its house. `approximated`
- **Route broken, car still on a road:** the car plans a new route to its goal. If none exists, it goes home. `approximated`
- **Current tile deleted:** the car walks back along its route to the last tile still a road, then goes home from there. `approximated`
- **No route home:** the car vanishes. `approximated`
- **Road added:** a driving car takes a new route only when it is shorter than what it has left. `approximated`
- **Car speed:** a car covers `CAR_SPEED` tiles per second along its route. `approximated`
- **Lanes:** roads are two lanes, and cars keep to the right. A car's lane is the direction it travels in on its tile, so opposite traffic never blocks it. `approximated`
- **Following gap:** a car stops `CAR_GAP` tiles short of the car ahead of it in its lane. `approximated`
- **Entering a tile:** a car may enter a tile only when no car in its lane on it is within `CAR_GAP` of the entrance. `approximated`
- **Junctions:** a road tile with `JUNCTION_MIN_ROADS` or more road neighbours is a junction. It holds one car at a time, and a car already on it blocks all others. When two cars reach a junction together, the one further along its route goes first, then the lower car id. `approximated`
- **Corner steps:** a car crossing a corner takes √2 times as long as an edge step, and its path curves through the tile centre. `approximated`
- **Queuing:** a car held at a tile edge waits there until the way clears. Cars are moved front-first each tick, so a follower sees its leader's new position. `approximated`
- **Car ownership:** each house owns `CARS_PER_HOUSE` cars when placed. A car that is lost (no way home) leaves its house owning one fewer. `approximated`
- **Spawning:** a connected house with a car at home sends one out every `SPAWN_INTERVAL_TICKS`, to a connected destination of its colour that has an unclaimed demand pin (see Demand), picked at random with equal chance. If no such destination or no route exists, the house waits for the next interval. `approximated`
- **Parking:** a car that reaches its destination parks on the destination's entrance tile for `PARK_TICKS`. Parked cars don't move, and they block their tile for others, as a queue would. `approximated`
- **Return:** after parking, the car drives home. A car that reaches home rejoins its house, which may send it out again. `approximated`
- **Movement along routes:** not yet implemented (C3).

### Buildings

- **Kinds:** houses (where cars start and end) and destinations (where cars go). Both occupy one tile.
- **Colours:** `BUILDING_COLOR_COUNT` colours. A house pairs with destinations of its own colour. `approximated`
- **Placement:** on land or park, on a tile with no road or building. Water and mountains are refused.
- **Entrance:** each building has one entrance side. It is connected only while the neighbour on that side is a road. A building can be placed before its road.
- **Roads:** a road cannot be placed on a building tile.
- **Removal:** buildings are never removed in M3.

### Score and clock

- **Score:** trips completed. A trip counts when a car reaches its destination and uses up a pin. A car sent home without arriving doesn't count. `approximated`
- **Weeks:** the clock counts weeks of `WEEK_TICKS` ticks from week 1. A finished game reports the week it ended in. `approximated`
- **Not yet:** the map expansion schedule. Weekly rewards are in M5.

### Overflow

- **Limit:** a destination holding more than `OVERFLOW_PIN_LIMIT` waiting pins overflows. `approximated`
- **Countdown:** an overflowing destination starts a countdown of `OVERFLOW_TICKS`, one tick at a time. `approximated`
- **Reset:** serving a pin resets that destination's countdown to full, so a busy destination that keeps being served never runs out.
- **Clear:** dropping back to the limit clears the countdown. It starts again from full the next time the destination overflows.
- **Game over:** when any countdown runs out, the game ends. The sim stops advancing and records the tick and destination.
- **On screen:** each overflowing destination has a ring round it that empties as its countdown runs out. The HUD shows the week, the seconds left in it, and trips. The end screen shows the week and trips.

### Demand

- **Pins:** each destination collects one demand pin every `DEMAND_INTERVAL_TICKS`, starting after its first interval. Pins are collected whether or not the destination is connected. `approximated`
- **Unclaimed pins:** a destination's pins minus the cars currently driving to it. A house only sends a car to a destination with an unclaimed pin, so a pin is never sent to two cars.
- **Arrival:** a pin is used up when a car arrives at its destination and starts to park.
- **Lost demand:** a car that goes home without arriving leaves its pin in place for the next car.
- **Business rates are still open:** the original has two business speeds, meaning two rates at which businesses request workers. Each rate and how it shows on screen is not yet decided, so every destination uses the one interval for now.

_Still to write: car movement and queuing, trips, spawning, demand, scoring, clock and expansion, upgrades, bridges and tunnels, roundabouts and lights, congestion, unlocks, audio events. Each arrives with its milestone._
