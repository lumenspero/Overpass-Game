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
- **Buildable:** roads may be placed on land and parks. Water and mountains block roads, except where a bridge or tunnel crosses them (see Bridges and tunnels). `approximated`

### Roads and road graph

- **Adjacency:** two road tiles are linked only when a drag stepped between them, across an edge or a corner. Each step of a drag links its two tiles. Placing a road never links it to a neighbour, so two roads side by side do not join unless a drag joins them, and a branch dragged off a straight road joins only the tile it starts from. A corner link is a diagonal road. Roads have no separate connection points. `approximated`
- **Graph nodes:** dead ends, junctions, isolated road tiles, and one representative tile for any closed loop with no node.
- **Graph edges:** chains of pass-through road tiles between nodes. Each edge stores its interior tiles and its length in steps (interior tiles + 1).
- **Updates:** after a change, only the connected road components next to the changed tiles are rebuilt. The result always matches a full rebuild. Tested with 500 random edits per seed.

### Road budget

- **Starting budget:** 120 road tiles, `ROAD_BUDGET_START`. `approximated`
- **Cost:** each newly placed road tile costs 1. Tiles that already have a road cost nothing.
- **Refund:** removing a road tile refunds 1.
- **Placement is all or nothing:** if the whole path doesn't fit in the budget, nothing is placed.
- **Weekly reward:** at each week boundary the budget gains `WEEKLY_ROAD_REWARD` tiles (see Upgrades). `approximated`

### Cars and routing

- **Routes:** a car's route is the list of road tiles from where it is to where it is going, both ends included. Routes step only along links, so between road tiles that a drag joined. An edge step costs 1 tile and a corner step costs √2. Routes are shortest by that cost. `approximated`
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
- **On screen:** a car drives into its building on arrival, parks at the building's centre, and leaves from that centre. A car leaving home starts at the house's entrance edge, so it never jumps. Parked cars at one destination are drawn on top of each other.
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
- **End screen:** shows the week reached and trips completed. Pins served are the same number as trips, so they aren't shown separately. Roads placed is not shown, since the original doesn't report it.
- **Weekly rewards:** see Upgrades.

### Motorways

Elevated links for faster travel between two points on the ground network. `approximated`

- **Placement:** the player presses on a start road tile and releases on an end road tile. Only the two ends align to the grid. The curve between them is free: it does not follow tiles. The drag shapes it: the points the drag passes become candidate control points, reduced to at most `MOTORWAY_MAX_NODES` handles so the curve stays readable. Both ends must be road tiles on the ground network, or they are refused (`bad-endpoint`).
- **Elevated:** the motorway passes over roads, water, mountains and buildings freely. It does not join ground roads except at its two ramp ends. It is drawn above roads and buildings with a soft shadow, so the ground stays visible beneath it.
- **Length:** the curve may be at most `MOTORWAY_MAX_LENGTH` tiles long. Longer is refused (`too-long`).
- **Cost:** one motorway from stock, and its curve length in tiles from budget (`MOTORWAY_COST_PER_TILE` each).
- **Travel:** cars may use a motorway between its ramps. Travel along it is `MOTORWAY_SPEED` times faster than ground roads. A car joins or leaves only at a ramp.
- **Nudging:** click a motorway to select it. Its handles appear, and dragging a handle moves that control point while the curve updates live. A nudge that breaks a rule (length, a ramp off the ground network) is refused and the handle snaps back. Clicking empty ground or pressing Escape deselects.
- **Erase:** erasing either ramp tile removes the whole motorway and returns its stock and the budget it cost. Undoing the erase restores it.
- **Cost on nudge:** a nudge that lengthens or shortens the curve changes its cost by the difference. A nudge the budget cannot cover is refused.
- **Preview:** while the player drags, a translucent curve follows the cursor, as bridges do.
- **Tools:** roads are laid only with the road tool (F). The default select tool only picks and nudges motorways, so a click on empty ground lays nothing. Erase is E, bridge B, tunnel T, motorway M. Each tool is a toggle, to be tidied into UI later.

### Expansion

- **Districts:** the map is split into districts numbered from 0. District 0 is open at the start. `EXPANSION_WEEK_1` (3) opens district 1 and `EXPANSION_WEEK_2` (6) opens district 2, and `EXPANSION_WEEK_3` (9) opens district 3. All three are live debug-panel values. `approximated`
- **Locked land:** tiles in a district that isn't open take no roads. Buildings on locked land are inactive (they send and collect nothing) and are hidden. The land is dimmed.
- **Opening only:** districts never close. A district beyond the schedule stays locked for the whole game. Bridges and tunnels cannot land on locked land.
- **Test map:** three districts west of the river, plus one east of it that opens at `EXPANSION_WEEK_3`.

### Upgrades

- **Weekly reward:** at each week boundary, the road budget gains `WEEKLY_ROAD_REWARD` tiles (20). No reward once the game is over. `approximated`
- **Offer:** each week the player is offered `UPGRADE_CHOICE_COUNT` (2) different upgrades, drawn without repeats. Each kind's chance is its weight: `UPGRADE_WEIGHT_BRIDGE`, `_TUNNEL`, `_MOTORWAY`, `_ROUNDABOUT`, `_LIGHT` (each 1). A weight of 0 means never offered. `approximated`
- **Implemented only:** only upgrades the sim can apply are offered. The list is `IMPLEMENTED_UPGRADES`: bridge and tunnel so far. It grows as each upgrade lands in M5. An offer needs at least two implemented kinds.
- **Stock:** answering an offer adds its kind to stock. Placing a bridge or tunnel uses one. Stock is not refunded when a crossing is removed.
- **Queue:** offers wait in `offers`, oldest first, until the player answers.
- **Choice screen:** a panel at the bottom of the screen shows the oldest offer as buttons, with a count of waiting offers. Choosing one puts it in stock. The game keeps running while an offer waits. The panel hides once the game is over. `approximated`
- **Pool:** bridge, tunnel, motorway, roundabout, light. Each is added to the offer list as it is built.

### Bridges and tunnels

- **Bridge:** a road dragged across water. The drag's path is the bridge, so it can turn and cross a lake's corner diagonally. `approximated`
- **Tunnel:** a road dragged through mountain, with the same rules. `approximated`
- **Span limit:** a run of new water (bridge) or mountain (tunnel) tiles along the path may be at most `BRIDGE_MAX_SPAN` (3) or `TUNNEL_MAX_SPAN` (4) tiles long. A run of 3 is "less than 4 nodes" for bridges. `approximated`
- **Runs:** each separate run of new crossing tiles on a path is one crossing, and uses one bridge or tunnel from stock. Two rivers in one drag need two bridges.
- **Endpoints and other tiles:** the path must start and end on land, park, or road. Its other tiles may be land, park, road, or the crossing's own terrain. A bridge cannot cross mountain, and a tunnel cannot cross water. Buildings block the path.
- **Cost:** every new road tile costs 1 from the budget, like any road. `approximated`
- **Existing crossings:** a drag over a road already on water or mountain is free and uses no stock.
- **Refusals:** nothing is placed when the path has a gap, is too long, lacks stock or budget, or touches a locked tile. A line under the HUD says the reason for three seconds.
- **Erasing:** a bridge or tunnel is one crossing. Erasing its tiles returns its stock once, when its last tile goes. An erase that is undone takes the stock back.
- **Preview:** while the drag is held, the path shows translucent. Nothing is built until release.
- **Routing:** a bridge or tunnel is an ordinary road for cars.

### Debug panel

- Not a player feature. It is a playtesting aid, toggled with D.
- Each slider sets one value in `config.ts` live, so a change takes effect on the next tick. Starting values (road budget, cars per house, building colours) apply to a new run, so use Restart run after changing them. Reset values puts every slider back to its default.
- Speed: buttons or keys 1 to 4 set the clock to 1×, 2×, 4× or 8×.
- Crossings (playtest aid): B and T pick the bridge and tunnel tools. A drag across water (bridge) or mountain (tunnel) builds the crossing on release, along the path dragged. While the tool is picked, the line under the HUD shows stock; after a release it shows the result for three seconds. `+1 bridge` and `+1 tunnel` add stock directly.
- Not included: click-to-spawn. It was a testing aid that doesn't match the intended game.

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

### Roundabouts and lights

- **Placement:** a roundabout or a light goes on any open land, park or road tile with no building on it. Mountain and water are refused. Each tile takes at most one of them. Each comes from the weekly offer and takes one from stock, as bridges do. `approximated`
- **Roundabout:** cars drive round the ring, keeping right (counter-clockwise on screen), so they never cut across the middle. The ring is drawn as a donut on the tile, with the centre left open. The junction stays open to several cars at once. A car may enter while no car on the junction is within `CAR_GAP` of the entrance, and it leaves once it has passed through. A plain junction still holds one car. Capacity is `ROUNDABOUT_CAPACITY` cars (default 3). `approximated`
- **Light:** the tile has two phases, one for each axis (across and along). Each phase has green for `LIGHT_GREEN_TICKS` ticks (default 240), then the other phase has green. A car may enter only in its phase's green, and waits short of the junction otherwise. Phases switch on the tick count, so runs stay deterministic. `approximated`
- **Keys:** O places a roundabout, L a light. Each is a toggle, like B, T and M.
- **Erasing:** removing the junction's road, or the roundabout or light itself, returns its stock.
- **Refusals:** `out-of-bounds`, `bad-endpoint` (a building, mountain or water), `locked`, `occupied` (a tile already has one), `no-stock`.

### Congestion-aware routing

- **Waiting cars:** a tile's congestion is the number of cars queued to enter it. A car is waiting when it has reached the end of its current tile and its next tile is the one in question, but it is held back from entering. `approximated`
- **Cost:** when a car plans its route, each waiting car on a tile adds `CONGESTION_COST_PER_CAR` steps to the cost of passing through that tile (default 1.5). The base cost stays distance, as now, so a detour is taken only when the queue outweighs the extra distance. `approximated`
- **Timing:** a car plans its route when its trip starts, using the queues it sees then. A car already driving re-plans only when a road is added or removed, and then uses the same queues, leaving out its own. It does not re-plan just because a queue has formed, so cars don't turn back for every jam.
- **Determinism:** routes depend only on the sim state at the moment of planning, so runs stay repeatable.

### Destination upgrades, growth and rule hooks

- **Destination upgrade:** an upgrade is placed on a destination building and takes one from stock, as the other upgrades do. Each one raises that destination's demand by `DEMAND_UPGRADE_STEP` (default 0.5), so it draws more cars for the same road. `approximated`
- **Growth:** each time a new district opens (`EXPANSION_WEEK_1`, `_2`, `_3`), every destination gains `DEMAND_GROWTH_STEP` (default 0.25) demand. Growth happens only at expansions, not each week. `approximated`
- **Rule hooks:** a map's rules are a list passed to the sim when it starts, each with a week it applies from. The first rule kind is `unlockColour`: a building colour is unused until its week. The sim reads the list at each week boundary, so a map changes by data, not code. `approximated`
- **Keys:** U places a destination upgrade, on a destination building.
- **Refusals:** a destination upgrade refuses a building that is not a destination (`not-a-destination`), one that already has the maximum upgrades (`max-upgrades`, default 3), and one with no stock (`no-stock`).

_Still to write: car movement and queuing, trips, spawning, demand, scoring, clock and expansion, upgrades, bridges and tunnels, roundabouts and lights, congestion, unlocks, audio events. Each arrives with its milestone._
