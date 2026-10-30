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

- **Adjacency:** two road tiles connect when they share an edge (not a corner). Roads have no separate connection points. `approximated`
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

- **Routes:** a car's route is the list of road tiles from where it is to where it is going, both ends included. Routes use edge-sharing road tiles only. `approximated`
- **Planning:** A* over road tiles, every step costs 1, Manhattan distance as the estimate. Ties go to the lower tile index, so the same roads always give the same route. `approximated`
- **Car states (M3):** driving to a destination, or returning to its house. `approximated`
- **Route broken, car still on a road:** the car plans a new route to its goal. If none exists, it goes home. `approximated`
- **Current tile deleted:** the car walks back along its route to the last tile still a road, then goes home from there. `approximated`
- **No route home:** the car vanishes. `approximated`
- **Road added:** a driving car takes a new route only when it is shorter than what it has left. `approximated`
- **Movement along routes:** not yet implemented (C3).

### Buildings

- **Kinds:** houses (where cars start and end) and destinations (where cars go). Both occupy one tile.
- **Colours:** `BUILDING_COLOR_COUNT` colours. A house pairs with destinations of its own colour. `approximated`
- **Placement:** on land or park, on a tile with no road or building. Water and mountains are refused.
- **Entrance:** each building has one entrance side. It is connected only while the neighbour on that side is a road. A building can be placed before its road.
- **Roads:** a road cannot be placed on a building tile.
- **Removal:** buildings are never removed in M3.

_Demand, to define at M4: businesses request workers at one of two rates (the original's two business speeds). Each rate and how it shows on screen is not yet decided. Not implemented in M3._

_Still to write: car movement and queuing, trips, spawning, demand, scoring, clock and expansion, upgrades, bridges and tunnels, roundabouts and lights, congestion, unlocks, audio events. Each arrives with its milestone._
