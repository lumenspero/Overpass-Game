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
- **Pause control:** P, or the Pause button, stops and restarts the clock. A speed key or button changes the speed and leaves the pause as it is. The HUD shows Paused while the clock is stopped, and the buttons are disabled once the game is over. `approximated`
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

- **Kinds:** houses (where cars start and end) and destinations (where cars go). A house occupies one tile; a destination occupies a 3×3 building inside its 5×3 lot (see Parking lots and building kinds).
- **Colours:** `BUILDING_COLOR_COUNT` colours. A house pairs with destinations of its own colour. `approximated`
- **Placement:** on land or park, on a tile with no road or building. Water and mountains are refused.
- **Entrance:** each building has one entrance side. It is connected only while the neighbour on that side is a road. A building can be placed before its road.
- **Roads:** a road cannot be placed on a building tile.
- **Removal:** buildings are never removed in M3.

- **Driveway:** a house's road extension is drawn as wide as the house body (`BUILDING_SCALE` of a tile), from the house to the road tile in front of its entrance. It is drawn only while that road exists. It is view only: the sim is unchanged. `approximated`
- **Open for M14:** a house connects only through its fixed entrance tile today. Connecting it from any of its 8 neighbours, with the entrance following the road, changes the sim's building rules and the road graph, and is deferred to M14.

### Score and clock

- **Score:** trips completed. A trip counts when a car reaches its destination and uses up a pin. A car sent home without arriving doesn't count. `approximated`
- **Weeks:** the clock counts weeks of `WEEK_TICKS` ticks from week 1. A finished game reports the week it ended in. `approximated`
- **End screen:** shows the week reached and trips completed. Pins served are the same number as trips, so they aren't shown separately. Roads placed is not shown, since the original doesn't report it.
- **End-of-run screen:** shows the week, trips, and the map's best ("New best" when the run beat it). For a campaign map it says whether the next map is open, or what would open it, and offers Play again, Play next (when open) and Menu. Demos and the test map keep no best and have no next map. Each campaign run's trips are recorded once, when the run ends. `approximated`
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

### Destination growth and rule hooks

- **Growth:** every week, every destination gains `DEMAND_GROWTH_STEP` (default 0.25) demand, so demand rises as the game goes on. It is automatic: the player has no choice in it, and destinations are not upgraded by hand. `approximated`
- **Rule hooks:** a map's rules are a list passed to the sim when it starts, each with a week it applies from. The first rule kind, `unlockColour` (a colour is unused until its week), is a temporary stopgap. Business arrival below replaces it at M14, and then it is removed. The sim reads the list at each week boundary, so a map changes by data, not code. `approximated`

### Campaign unlocks

- **Campaign order:** the campaign plays its maps in a fixed order. The first map is open from the start.
- **Unlock rule:** a run unlocks the next map in the order when its trips reach `CAMPAIGN_UNLOCK_TRIPS` (default 20). The check is made when the run ends, against the trips that run completed. The same threshold applies to every map until per-map values arrive with the map content in M14. `approximated`
- **Best scores:** kept per map and per mode (campaign or challenge): the highest trips of any finished run. A map's open or locked state is derived from these, so nothing else is stored. Campaign and challenge bests are separate. `approximated`
- **Challenge mode:** each challenge is scored by trips, as in the campaign. No goal beyond score (such as a road-tile limit) yet. The challenge list is empty until M14 supplies maps with starter roads. `approximated`

### Settings

- **Motorway guide:** on by default. Toggled with G or in Settings. `approximated`
- **Dark mode:** light by default. Toggled with N or in Settings. `approximated`
- **Building symbols:** off by default. When on, each building colour draws one symbol: circle, square, triangle, then diamond, in the building palette's order, repeating past four colours. The symbol is black or white, whichever has the higher contrast with the colour. Houses and destinations both carry it. Cars and pins are not symbol-coded yet. `approximated`
- **Settings screen:** reached from the menu and from the Settings button in play. In play, the clock stops while it is open and resumes after, if it was running. Escape or Done closes it.
- **Storage:** settings are held in memory until M11 saves them. No audio setting until M12.

### Business arrival and house supply

_Planned for M14 with the spawn system. Not built yet._

- **Arrival:** from `BUSINESS_ARRIVAL_START_WEEK` on, new destinations (businesses) arrive in each week, up to a count set by global tuning. Arrivals are not tied to a map's rules. `approximated`
- **Colours:** a colour appears when a business of that colour arrives. There is no guarantee of a new colour at each arrival. `approximated`
- **Supply at arrival:** a new business has its demand met by houses spawned at the same moment as the business.
- **Supply through the week:** houses also spawn during the week, so a business can gain supply after it opens.
- **Supply ratio:** for each colour, the sim keeps houses per destination inside a band, `SUPPLY_RATIO_MIN` to `SUPPLY_RATIO_MAX` (global tuning, `approximated`). Houses are added when the ratio falls below the minimum. None are added above the maximum. This stops a colour being oversupplied with houses where it has no demand, while still allowing new houses in the middle of the week.
- **Open for M14:** how a new business's colour is chosen, and the tuning values.

### Parking lots and building kinds

_Planned for M9a. Not built yet. Where this conflicts with the Buildings, Cars and routing, and Demand entries above, this section replaces them once M9a lands._

- **Houses:** 1×1 square, as now. Houses start and end trips.
- **Destinations:** 3×3 tiles. Two kinds:
  - **Square:** slower demand, from the starter game to the mid game.
  - **Round:** higher demand, from the mid game to the late game.
    Each kind has its own demand interval, to be tuned. Square is always the slower of the two. `approximated`
- **Lot:** each destination sits on a standard lot, 5 tiles long and 3 deep. The road runs along one long edge. The 3×3 building sits at one end of the lot, and the 2×3 strip at the other end is left open for the parking spaces and the turn. The inlet is the strip tile on the road edge, at the end farthest from the building, and it is the only connection. Cars drive from the road through the inlet into the lot. Houses have no lot; they keep the entrance tile. `approximated`
- **Double lot:** a later-game lot has two inlets and room for two buildings. It starts with one building placed. The other space is an empty square outline inside the lot, drawn in the lot's colours, until a second building is added to it. A car may use either inlet.
- **Parking:** the 2×3 open strip holds the parking spaces, which are diagonal. A car drives in through the inlet and parks in a free space, where it finishes the trip.
- **Leaving:** after finishing, the car turns in the lot and drives out through the inlet on the opposite lane to the one it came in on. The turn is a visible manoeuvre, not an instant change of direction.
- **Waiting:** a car that finds the lot's spot taken waits in the lot, not on the road. `approximated`

- **Spawning reserves the lot:** the lot is part of the destination. Spawning one reserves all fifteen of its lot tiles, so roads and other buildings cannot use them. A spawn is refused when any lot tile is water, mountain or locked, has a road or building on it, or is already reserved. A spawn may come before its road, as houses may.

**Open for M9a:**

- Demand interval for each kind, and the weeks each kind appears.
- Parking spaces: how many, and where in the 2×3 strip.
- The turn: where the car turns in the strip between the inlet and its space.
- Whether a lot's diagonal space is one per destination, or one per building in a double lot.
- The week double lots appear.
- How and when the second building is added to a double lot: what triggers it, what it costs, and which kind it can be.
- Map format and Studio placement for 2×2 footprints and lot inlets.

_Still to write: car movement and queuing, trips, spawning, demand, scoring, clock and expansion, upgrades, bridges and tunnels, roundabouts and lights, congestion, unlocks, audio events. Each arrives with its milestone._
