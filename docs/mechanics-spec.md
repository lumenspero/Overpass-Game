# Mechanics spec

Every rule and constant in Overpass_Game. Each entry carries one tag:

- `approximated` — first-pass value, not yet playtested
- `tuned` — adjusted at a checkpoint
- `confirmed` — signed off at a checkpoint

Gameplay numbers live in `packages/sim/src/config.ts`; this file documents them.

## Sections

### Clock and time

- **Tick rate:** 30 ticks per second of game time, `TICKS_PER_SECOND` in `config.ts`. `approximated`
- **Speeds:** the clock menu offers normal speed (1×) and fast-forward (2×). Pausing stops ticks without losing time. The keys 1 to 4 still pick 1×, 2×, 4× and 8× for playtesting. `approximated`
- **Pause control:** P, or Pause in the clock menu, stops and restarts the clock. Play and fast-forward start the clock again, at 1× or 2×. A speed key leaves the pause as it is. The clock menu's buttons are disabled once the game is over. `approximated`
- **Calendar (display only):** a week is seven days of equal length, Monday first, so the day shown is the week's seventh-part the tick falls in. The clock dial turns twice per day, so it shows a 24-hour cycle on a 12-hour face, and the second half of the day is shown inverted (PM). The day and the dial have no gameplay effect. Design decision, 2026-11-02.
- **Catch-up cap:** at most 15 ticks run for one frame, so a stall can't freeze the game. `MAX_CATCHUP_TICKS`. `approximated`

### Grid and terrain

- **Grid:** tiles in a rectangle, stored row by row. Tiles outside the grid are not playable.
- **Terrain kinds:** land, water, mountain, park, out-of-bounds.
- **Buildable:** roads may be placed on land and parks. Water and mountains block roads, except where a bridge or tunnel crosses them (see Bridges and tunnels). `approximated`

### Roads and road graph

- **Adjacency:** two road tiles are linked only when a drag stepped between them, across an edge or a corner. Each step of a drag links its two tiles. Placing a road never links it to a neighbour, so two roads side by side do not join unless a drag joins them, and a branch dragged off a straight road joins only the tile it starts from. A corner link is a diagonal road. Roads have no separate connection points. `approximated`
- **Graph nodes:** dead ends, junctions, isolated road tiles, and one representative tile for any closed loop with no node.
- **Graph edges:** chains of pass-through road tiles between nodes. Each edge stores its interior tiles and its length in steps (interior tiles + 1).
- **Bends:** a road tile linked to two straight (not diagonal) neighbours at right angles is a bend. It is drawn as a quarter circle of radius half a tile, centred on the tile corner the two arms turn round, so its inside edge is rounded rather than sharp. Car lanes through a bend follow the same curve (see On screen). Drawing only; routing is unchanged. Where a road turns into a lot's inlet or a house, the inlet tab or the driveway counts as a link for drawing, so the access node is drawn as a bend too. `approximated`
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
- **Joining the road:** a car leaving a house, a lot or a kerb joins only when its lane is clear where it meets it, and no car in its lane will reach that point within `CAR_GAP` of it. A car crossing the other lane also waits for cars at or moving toward its crossing point. A car returning home across the other lane waits short of its turn in the same way. After waiting 5 seconds it no longer waits for stopped traffic; after 10, in gridlock, a lot car merges into a stopped queue in its own lane. `approximated`
- **Queuing:** a car held at a tile edge waits there until the way clears. Cars are moved front-first each tick, so a follower sees its leader's new position. `approximated`
- **Car ownership:** each house owns `CARS_PER_HOUSE` cars when placed. A car that is lost (no way home) leaves its house owning one fewer. `approximated`
- **Spawning:** a connected house with a car at home sends one out every `SPAWN_INTERVAL_TICKS`, to a connected destination of its colour that has an unclaimed demand pin (see Demand), picked at random with equal chance. If no such destination or no route exists, the house waits for the next interval. The interval runs from the moment a car leaves: a house whose car could not pull out, because the road beside it was not clear, tries again next tick. `approximated`
- **Parking:** a car that reaches its destination parks on the destination's entrance tile for `PARK_TICKS`. Parked cars don't move, and they block their tile for others, as a queue would. `approximated`
- **On screen:** a car drives into its building on arrival, parks at the building's centre, and leaves from that centre. A car leaving home starts at the house's entrance edge, so it never jumps. Parked cars at one destination are drawn on top of each other. A car going into a house turns onto the house's lane of the road where the road meets the house's stub, then drives into the doorway on its own lane, so it never cuts across the middle of the road. A car leaving a house does the same in reverse. Through a bend, a car's lane follows the rounded corner under Roads, so it stays inside the road.
- **Return:** after parking, the car drives home. A car that reaches home rejoins its house, which may send it out again. `approximated`
- **Movement along routes:** not yet implemented (C3).

### Buildings

- **Kinds:** houses (where cars start and end) and destinations (where cars go). A house occupies one tile; a destination occupies a 3×3 building inside its 5×3 lot (see Parking lots and building kinds).
- **Colours:** `BUILDING_COLOR_COUNT` colours. A house pairs with destinations of its own colour. `approximated`
- **Who places them:** never the player. Every house and destination is spawned by the game at random, inside the fence, which grows slowly through the game (see Expansion), so a new building always appears near the existing city. The random spawn system is built in M14 (see Business arrival and house supply); until then the test map's buildings are hand-placed for testing.
- **Placement:** on land or park, on a tile with no road or building. Water and mountains are refused.
- **Entrance:** each building has one entrance side. A destination connects through its lot's inlet road. A house connects through its stub (below).
- **House stub:** every house comes with a stub, one road tile beside it, placed free on the tile its entrance faces. The stub is part of the house: it costs no budget, and erasing never removes it. Erasing over the stub cuts its links instead, so the road is disconnected and the stub stays behind (a roundabout or light on it can still be taken back). The player moves it by dragging from the house to any of its 8 neighbours, by an edge or a corner; the move is free, and the drag then draws on from the stub. A stub may take over a road already on that tile; moving away leaves that road while other roads are joined to it, and otherwise removes it with a refund, as erasing it would; a stub on empty land goes with the house, with no refund, since it was never paid for. A stub can't go on water, mountain, a building or a lot, or on land not yet open. Neighbouring houses may share one stub tile, so they join the road at one node; when one house moves its stub away, the road stays for the other, and a free stub it leaves becomes the other house's free stub, so no move ever refunds a road nobody paid for. A house whose facing tile can't take a stub connects through that tile, as before.
- **Roads:** a road cannot be placed on a building tile.
- **Removal:** buildings are never removed in M3.

- **Driveway:** a house's road extension is drawn at road width, from the house to its stub road tile, as a road link for drawing. So a road that passes the stub is a junction joined to the house without a gap, and a road that ends at the stub bends into the house. It is drawn only while that road exists. It is view only: the sim is unchanged. `approximated`
- **Cars at a bent driveway:** where a house's stub is drawn as a bend into the house, a car entering follows the bend's curve in its lane and then drives straight in, and a car leaving drives straight out in its lane and then follows the curve into its lane on the road. Where the stub is a junction, cars turn at the lanes' corner as before. View only. `approximated`
- **Popping in:** a building that appears, or a business that levels up to round, pops in on a spring: it grows from nothing to about a fifth past full size, dips back a little under it, then settles, over `POP_MS` (0.65 seconds). Demand pins pop in the same way. Buildings already on the board when a game starts or resumes appear in place. View only. `approximated`
- **Hidden stubs:** a house outside the fence keeps its stub there, hidden with it, and roads can't join it until the fence grows over it. A run saved before stubs gives each house one on load.

### Score and clock

- **Score:** trips completed. A trip counts when a car reaches its destination and uses up a pin. A car sent home without arriving doesn't count. `approximated`
- **Weeks:** the clock counts weeks of `WEEK_TICKS` ticks from week 1. A week is 2700 ticks, which is 90 seconds at 1× (30 ticks a second). Car speed is unchanged, so weeks are longer rather than the game slowed. A finished game reports the week it ended in. `approximated`
- **End screen:** shows the week reached and trips completed. Pins served are the same number as trips, so they aren't shown separately. Roads placed is not shown, since the original doesn't report it.
- **End-of-run screen:** shows the week, trips, and the map's best ("New best" when the run beat it). For a campaign map it says whether the next map is open, or what would open it, and offers Play again, Play next (when open) and Menu. Demos and the test map keep no best and have no next map. Each campaign run's trips are recorded once, when the run ends. `approximated`
- **Weekly rewards:** see Upgrades.

### Motorways

Elevated links for faster travel between two points on the ground network. `approximated`

- **Placement:** the player presses on a start road tile and releases on an end road tile. Only the two ends align to the grid. The curve between them is free: it does not follow tiles. The drag shapes it: the points the drag passes become candidate control points, reduced to at most `MOTORWAY_MAX_NODES` handles so the curve stays readable. Both ends must be road tiles on the ground network, or they are refused (`bad-endpoint`). A business's inlet counts as road: an end on a lot's unbuilt access tile lays that tile as road with the motorway, for one tile of budget.
- **Elevated:** the motorway passes over roads, water, mountains and buildings freely. It does not join ground roads except at its two ramp ends. It is drawn above roads and buildings with a soft shadow, so the ground stays visible beneath it.
- **Length:** the curve may be at most `MOTORWAY_MAX_LENGTH` tiles long. Longer is refused (`too-long`).
- **Cost:** one motorway from stock, and its curve length in tiles from budget (`MOTORWAY_COST_PER_TILE` each).
- **Travel:** cars may use a motorway between its ramps. Travel along it is `MOTORWAY_SPEED` times faster than ground roads. A car joins or leaves only at a ramp.
- **Dock placement:** dragging the motorway piece from the dock onto the map sets its first end at the drop point, if the drop is on the map. A ring marks the first end. The motorway then follows the cursor as a straight line, and the next click sets the second end. A refused end keeps the first, so another end can be tried. Escape cancels. The drag shapes a motorway only when it is drawn on the map. `approximated`
- **Nudging:** click a motorway to select it. Its handles appear, and dragging a handle moves that control point while the curve updates live. A nudge that breaks a rule (length, a ramp off the ground network) is refused and the handle snaps back. Clicking empty ground or pressing Escape deselects.
- **Erase:** erasing either ramp tile removes the whole motorway and returns its stock and the budget it cost. Undoing the erase restores it.
- **Cost on nudge:** a nudge that lengthens or shortens the curve changes its cost by the difference. A nudge the budget cannot cover is refused.
- **Preview:** while the player drags, a translucent curve follows the cursor, as bridges do.
- **Tools:** with the default select tool, a press on a motorway picks it or nudges its handle, and a press and drag anywhere else draws road until the button is released. A click that never moves lays nothing. The road tool (F) also draws. Erase is E, bridge B, tunnel T, motorway M. Each tool is a toggle, to be tidied into UI later. Bridge, tunnel, motorway, roundabout and light tools place one piece: once it is built, the default tool comes back, so the next drag draws road. A refused placement keeps the tool.

### Expansion

- **Fence:** each map has a starting fence: a rectangle of tiles. Every imported map starts with a 24 by 14 fence centred in its frame; a frame smaller than that gets a fence the size of the frame. Setting it per map in the Studio is not built yet. Only tiles inside the fence take roads, buildings and spawns. Land outside it stays visible, dimmed and locked. Replaces the district schedule. `planned`
- **Weekly growth:** the fence grows `FENCE_STEPS_PER_WEEK` (1) steps a week. Each step adds a column on the east and the west, and one row, on the north on odd steps and the south on even ones: 2 wide and 1 high a week. It stops at the map edge. `approximated`
- **Visible growth:** each step's new edge slides across its strip over `FENCE_REVEAL_TICKS` (1.5 seconds at 1x). In draw mode the edge is drawn as a boundary that is not locked to the grid: the grid shows only inside it, and land outside is dimmed. The grid itself shows only while the player presses on the map with a build tool, and hides on release. Tiles open once the edge has passed over them. `approximated`
- **Frame shape:** 16:9 is the target shape of the window that frames the fence. It is not the node count: the fence's starting width and height are set per map.
- **Blocking:** roads and buildings cannot be placed beyond the fence, and roads cannot cross it. Bridges and tunnels cannot land outside it.
- **Opening only:** the fence never shrinks.
- **Spawning:** houses and destinations spawn only inside the fence (see Business arrival and house supply once written).

### Starting pair and opening view

- **Starting pair:** a played map starts with one house and one destination of the same colour. The house is picked at random inside the fence. The destination lies 5 to 10 tiles away (`START_PAIR_MIN_TILES` and `START_PAIR_MAX_TILES`), inside the fence. Later spawns follow the rules in Business arrival and house supply. `approximated`
- **Opening view:** the camera centres on the starting fence and zooms so the fence fills the screen. The player can zoom out until the map fills the screen. The area past the grid never shows, so a map whose shape differs from the screen cannot be seen whole. `approximated`
- **Clipping:** terrain outlines are clipped to the grid, so shapes that run past its edge do not show.

### Upgrades

- **Weekly offer:** at each week boundary the player is offered `UPGRADE_CHOICE_COUNT` (2) different options. The clock pauses until one is chosen. No offer once the game is over. `approximated`
- **Options:** each option gives upgrades and road tiles. Choosing one adds its upgrades to stock and its tiles to the budget. `approximated`
  - Motorway: 1 motorway, 10 tiles.
  - Bridge: 1 bridge, 20 tiles.
  - Roundabout: 1 roundabout, 20 tiles.
  - Tunnel: 1 tunnel, 20 tiles.
  - Traffic lights: 2 traffic lights, 20 tiles.
  - Road tiles: 30 tiles, no upgrade.
- **Weights:** each option's chance is its weight: `UPGRADE_WEIGHT_MOTORWAY`, `_BRIDGE`, `_ROUNDABOUT`, `_TUNNEL`, `_LIGHT` (traffic lights), `_TILES`, each 1. A weight of 0 means never offered. `approximated`
- **Map restrictions:** each map can list the options it allows, so a map where bridges or tunnels are not useful can leave them out. Road tiles are always allowed, so a restricted map still gives a choice. The Studio sets the list with one checkbox per option; the list is stored as an `allowedOffers` rule on the map, and the weekly offer draws only from it. A map with no such rule allows every option, and at least one option must stay on.
- **Replaces the weekly reward:** the tiles in an option are the week's road reward. There is no separate weekly tile grant. This replaces the earlier fixed 20 tiles a week (`WEEKLY_ROAD_REWARD`, removed).
- **Stock:** choosing an option adds its upgrades to stock. Placing a bridge or tunnel uses one. Stock is not refunded when a crossing is removed.
- **Queue:** offers wait in `offers`, oldest first, until the player answers. The clock stops while any offer waits.
- **Choice screen:** shows the oldest offer as two choices. The redesigned popup and inventory dock are built in M13.
- **Pool:** motorway, bridge, roundabout, tunnel, traffic lights, road tiles. `OFFER_OPTIONS` in `upgrades.ts` holds the table.

### Bridges and tunnels

- **Bridge:** a road dragged across water. The drag's path is the bridge, so it can turn and cross a lake's corner diagonally. `approximated`
- **Tunnel:** a road dragged through mountain, with the same rules. `approximated`
- **Automatic:** a bridge or tunnel is not carried and cannot be dragged from the dock. Drawing a road onto water or mountain with one in stock places it on its own: the road reaches the far bank and the crossing is built. With no stock, the road stops at the shore. A road that cannot reach land on the far side builds nothing. `approximated`
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

- **Limit:** a destination holds at most `OVERFLOW_PIN_LIMIT` (9) waiting pins, counting only pins no car is on its way to. A pin with a car coming is being met, so it does not count, and houses keep sending cars until they run out. A business overflows only when its houses cannot keep up. `approximated`
- **Overflow pin:** a request that arrives while the limit is waiting adds no pin. It starts the destination's overflow pin, which fills steadily, taking as long as `OVERFLOW_FILL_PINS` (9) more requests would take to arrive at that destination. `approximated`
- **Draining:** while the overflow pin is filling, each car that arrives drains one `OVERFLOW_FILL_PINS`-th of the fill, and the waiting pins stay. Once the fill is empty the overflow ends, and arriving cars use up pins again. A new overflow starts only with the next request that arrives while the limit is waiting.
- **Game over:** when any overflow pin is full, the game ends. The sim stops advancing and records the tick and destination.
- **On screen:** each waiting pin is a small pin in the business's colour, with a white rim and dot, on top of the building: a 3×3 grid on a square business, filled row by row from the top left, and a clock-face ring on a round one, filled clockwise from 12. While a business overflows, one large pin replaces them over the building: pale with a dark outline, filling red counterclockwise from the top. Every pin has a slight shadow and pops in when it appears. The HUD shows the week, the seconds left in it, and trips. The end screen shows the week and trips.

### Demand

- **Pins:** each destination collects one demand pin every `DEMAND_INTERVAL_TICKS`, starting after its first interval. Pins are collected whether or not the destination is connected. `approximated`
- **Unclaimed pins:** a destination's pins minus the cars currently driving to it. A house only sends a car to a destination with an unclaimed pin, so a pin is never sent to two cars.
- **Arrival:** a pin is used up when a car arrives at its destination and starts to park.
- **Lost demand:** a car that goes home without arriving leaves its pin in place for the next car.
- **Business rates are still open:** the original has two business speeds, meaning two rates at which businesses request workers. Each rate and how it shows on screen is not yet decided, so every destination uses the one interval for now.

### Roundabouts and lights

- **Placement:** a roundabout or a light goes on any open land, park or road tile with no building on it. Mountain and water are refused. Each tile takes at most one of them. A roundabout's ring also reaches its four orthogonal neighbours, so it is refused where any of those holds a building, a lot tile, mountain or water, or another roundabout. Each comes from the weekly offer and takes one from stock, as bridges do. `approximated`
- **Roundabout:** cars drive round the ring counter-clockwise on screen, keeping right, so they never cut across the middle. A car from one arm to another takes the counter-clockwise way round, so a left turn goes the long way. The ring is drawn as a donut two tiles across: its band is one road wide, centred 0.75 tiles from the tile's centre, with the centre left open. Each arm meets the ring at the neighbouring tile's centre, the ring's outer edge, and cars join and leave on a short curve so they turn smoothly rather than cut in. Road arms are drawn under the ring's kerb, so no curb shows where an arm joins. The junction stays open to several cars at once. A car may enter while no car on the junction is within `CAR_GAP` of the entrance, and it leaves once it has passed through. A plain junction still holds one car. Capacity is `ROUNDABOUT_CAPACITY` cars (default 3). `approximated`
- **On and off the ring:** a roundabout's ring reaches the centre of each neighbouring tile, so a car on a neighbour is drawn only over that tile's other half. That half costs half a step, so the car's speed on screen stays even on and off the ring, and it moves straight along its lane there rather than easing to a stop at the ring's edge. A lot whose access tile is beside a roundabout is entered from the ring's edge at that tile's centre, and a car leaving it joins the road there, ready to go round. `approximated`
- **Light:** the tile has two phases, one for each axis (across and along), and each light keeps its own. A car may enter only in its phase's green, and waits short of the junction otherwise. The light reads the traffic: it counts the cars at it or coming to it within `LIGHT_SENSE_TILES` (2) tiles on each axis. Green lasts at least `LIGHT_MIN_GREEN_TICKS` (60). After that it switches when cars wait on the red axis and none come on the green one, or when green has lasted `LIGHT_MAX_GREEN_TICKS` (240) while cars wait on both. With no car on the red axis it keeps its green. A new light starts with green across. The rule uses only the sim's state, so runs stay deterministic. `approximated`
- **Keys:** O places a roundabout, L a light. Each is a toggle, like B, T and M.
- **Erasing:** removing the junction's road, or the roundabout or light itself, returns its stock.
- **Refusals:** `out-of-bounds`, `bad-endpoint` (a building, mountain or water), `locked`, `occupied` (a tile already has one), `no-stock`.

### Congestion-aware routing

- **Waiting cars:** a tile's congestion is the number of cars queued to enter it. A car is waiting when it has reached the end of its current tile and its next tile is the one in question, but it is held back from entering. `approximated`
- **Cost:** when a car plans its route, each waiting car on a tile adds `CONGESTION_COST_PER_CAR` steps to the cost of passing through that tile (default 1.5). The base cost stays distance, as now, so a detour is taken only when the queue outweighs the extra distance. `approximated`
- **Timing:** a car plans its route when its trip starts, using the queues it sees then. A car already driving re-plans only when a road is added or removed, and then uses the same queues, leaving out its own. It does not re-plan just because a queue has formed, so cars don't turn back for every jam.
- **Determinism:** routes depend only on the sim state at the moment of planning, so runs stay repeatable.

### Destination growth and rule hooks

- **Growth:** every week, every destination gains `DEMAND_GROWTH_STEP` (default 0.1) demand, so demand rises as the game goes on. It is automatic: the player has no choice in it, and destinations are not upgraded by hand. `approximated`
- **Rule hooks:** a map's rules are a list passed to the sim when it starts, so a map changes by data, not code. The one map rule kind is `allowedOffers`, which leaves out upgrade offers the map does not want. Colours are not a map rule: they arrive with businesses (see Business arrival and house supply). `approximated`

### Campaign unlocks

- **Campaign order:** the campaign plays its maps in a fixed order. The first map is open from the start.
- **Unlock rule:** a run unlocks the next map in the order when its trips reach `CAMPAIGN_UNLOCK_TRIPS` (default 20). The check is made when the run ends, against the trips that run completed. The same threshold applies to every map until per-map values arrive with the map content in M14. `approximated`
- **Best scores:** kept per map and per mode (campaign or challenge): the highest trips of any finished run. A map's open or locked state is derived from these, so nothing else is stored. Campaign and challenge bests are separate. `approximated`
- **Challenge mode:** each challenge is scored by trips, as in the campaign. No goal beyond score (such as a road-tile limit) yet. The challenge list is empty until M14 supplies maps with starter roads. `approximated`

### Settings

- **Motorway guide:** on by default. Toggled with G or in Settings. `approximated`
- **Dark mode:** light by default. Toggled with N or in Settings. `approximated`
- **Building symbols:** off by default. When on, each building colour draws one symbol: circle, square, triangle, then diamond, in the building palette's order, repeating past four colours. The symbol is black or white, whichever has the higher contrast with the colour. Houses and destinations both carry it. Cars and pins are not symbol-coded yet. `approximated`
- **Settings screen:** reached from the main menu only. It is not in play; the G and N keys still toggle the guide and dark mode during a game.
- **Storage:** settings are saved with the rest of the progress (see Persistence). Audio levels (music, effects and soundscape, 0 to 10) are saved too.

### Persistence

These are rules for saving, not gameplay numbers, so they carry no tag.

- **What is saved:** the best trips per play, the settings, and the run in progress on each campaign map. The test map and demos keep nothing.
- **When a run is saved:** at the start of each week of a campaign run, when the page is hidden, and when the player leaves a game for the menu. A run that has ended is removed, so a finished run never resumes.
- **Resuming:** the menu offers Resume on a map with a saved run, at the week it was saved. The resumed game runs at once, at 1×, as a new game does. The clock menu and P pause it.
- **Map check:** a saved run resumes only on a map with the same content hash. If the map changed since the save, the run is discarded and the menu says why.
- **Export and import:** a save can be downloaded as a JSON file, or copied as a text code (`OG1.` followed by the compressed save). Importing either replaces the progress in this browser, after the player confirms.
- **Blocked storage:** when browser storage can't be opened or read, or fails later, the game plays on from memory and the menu says progress lasts only until the page is closed. Export offers the way to keep it.
- **Unreadable saves:** a saved progress that can't be read is not loaded, and it is kept under a separate key rather than overwritten.
- **Versions:** each save carries a `schemaVersion`. A save from a newer version is refused, and older versions are migrated one version at a time.

### Business arrival and house supply

_Built in M14 (part 2). Painted spawn zones are not used: new buildings are placed by the fence and reach rules below._

- **Arrival:** from `BUSINESS_ARRIVAL_START_WEEK` on, new destinations (businesses) arrive at the start of each week, once its reward is chosen: `BUSINESS_ARRIVALS_PER_WEEK`, and `BUSINESS_BONUS_ARRIVALS` more every `BUSINESS_BONUS_EVERY_WEEKS` weeks. Arrivals are not tied to a map's rules. Each new business comes with one house of its colour, placed at the same time by the house rules below; its other houses come at the house moments. `approximated`
- **Shape:** the starting business and every arrival are square, the slower kind, until `SHAPE_SWITCH_WEEK`. From then each arrival is a new round business (`ARRIVAL_ROUND_CHANCE`), a level-up that turns an existing square business round, keeping its lot and colour (`ARRIVAL_LEVEL_UP_CHANCE`), or otherwise a new square one. A level-up with no square business left brings a new round one. `approximated`
- **Colours:** a colour appears when a business of that colour arrives. There is no guarantee of a new colour at each arrival. `approximated`
- **House moments:** houses spawn at `HOUSE_MOMENTS_MIN` to `HOUSE_MOMENTS_MAX` moments each week, not with the business. At each moment, every colour below the supply band is topped up. The first moment falls in the week's first quarter, so a business that arrived at the week's start soon has houses, ahead of its demand overflowing; any others fall later in the week. The moments are fixed by the run's seed and the week. They run from week 1.
- **Supply ratio:** for each colour, the sim keeps houses per destination inside a band, `SUPPLY_RATIO_MIN` to `SUPPLY_RATIO_MAX` (global tuning, `approximated`). Houses are added when the ratio falls below the minimum. None are added above the maximum. This stops a colour being oversupplied with houses where it has no demand, while still allowing new houses in the middle of the week.
- **Colour choice:** a new business takes a colour picked at random from all the building colours. Nothing guarantees a new colour. `approximated`
- **Values (approximated):** arrivals start in week 2, one business a week, and two in weeks 10, 20 and so on. Rounds and level-ups start in week 10, each at 25%. Houses come at 1 or 2 moments a week. A colour is topped up to 3 houses per business when it falls below 2. Houses spawn only within 5 tiles of an existing road or 10 tiles of a building (a business counts from every tile of its lot), and inside the fence. They need not be connected. Distances are Chebyshev, in tiles. All in `config.ts`.
- **No spawn zones:** the map format has no spawn zones or spawn weights, and the Studio does not paint them. Every spawn, the starting pair included, is placed by the fence and the reach rules above. Asked by the author.
- **Demos:** scripted demos bring their own buildings, so they pass a sim-only `noSpawns` rule that turns arrivals and house moments off. Maps cannot set it.

### Parking lots and building kinds

_Built from M9a. Where this conflicts with the Buildings, Cars and routing, and Demand entries above, this section replaces them once M9a lands._

- **Houses:** 1×1 square, as now. Houses start and end trips.
- **Destinations:** 3×3 tiles. Two kinds:
  - **Square:** slower demand, from the starter game to the mid game.
  - **Round:** higher demand, from the mid game to the late game.
    Each kind has its own demand interval, to be tuned. Square is always the slower of the two. `approximated`
- **Lot:** each destination sits on a standard lot, 5 tiles long and 3 deep. The road runs along one long edge. The 3×3 building sits at one end of the lot, and the 2×3 strip at the other end is left open for the parking spaces and the turn. The inlet is the strip tile on the road edge, at the end farthest from the building, and it is the only connection. Cars drive from the road through the inlet into the lot. Houses have no lot; they keep the entrance tile. A new lot's road access tile must lie outside every other lot and have no building on it, so a business never faces into another business's lot. `approximated`
- **Double lot:** a later-game lot has two inlets and room for two buildings. It starts with one building placed. The other space is an empty square outline inside the lot, drawn in the lot's colours, until a second building is added to it. A car may use either inlet.
- **Parking:** the 2×3 open strip holds the parking spaces, which are diagonal. A car drives in through the inlet and parks in a free space, where it finishes the trip.
- **Queue in the lot:** when every space a car can reach is taken, it drives up the lot's inbound lane and waits beside a taken space, just short of the turn into it. The queue fills from the deepest space outward, so no car passes a waiting one; a single lot holds 3 parked and 3 queued, a double lot 7 and 7. A queued car turns in when its space empties, or drives on to a deeper space that empties first if no car waits between. Only when the queue is full too does a car wait on the road. A queued car past the entrance does not hold the lane, so cars can still leave. A double lot's far inlet has no queue. `approximated`
- **Leaving:** after finishing, the car turns in the lot and drives out through the inlet on the opposite lane to the one it came in on. The turn is a visible manoeuvre, not an instant change of direction.
- **Waiting:** a car that finds the lot's spot taken waits in the lot, not on the road. `approximated`

- **Crossing the inlet:** a car driving in crosses the lot's edge in the inlet's right-hand lane, and a car leaving crosses in the other lane, on both the near and far inlets of a double lot, never on a road edge. A car leaving turns from the lot's edge along the road's rounded corner in its lane, and joins the road just inside the access node's far edge. A car turning into a lot starts its turn at the access tile's entry edge and follows the road's rounded corner in its lane, whichever side of the road the lot is on. Lots get no new inlets: roads may not be placed on a lot tile, so the starting inlet is the only one. `approximated`
- **Spawning reserves the lot:** the lot is part of the destination. Spawning one reserves all fifteen of its lot tiles, so roads and other buildings cannot use them. Its access road tile, just outside the inlet, is kept clear too: no house may stand on it and no other lot may cover it, and a lot cannot spawn with a building on its own access road. A spawn is refused when any lot tile is water, mountain or locked, has a road or building on it, or is already reserved. A spawn may come before its road, as houses may.

**Open for M9a (not yet recorded here as answered):**

- Demand interval for each kind, and the weeks each kind appears.
- Parking spaces: how many, and where in the 2×3 strip.
- The turn: where the car turns in the strip between the inlet and its space.
- Whether a lot's diagonal space is one per destination, or one per building in a double lot.
- The week double lots appear.
- How and when the second building is added to a double lot: what triggers it, what it costs, and which kind it can be.
- Map format and Studio placement for 2×2 footprints and lot inlets.

_Still to write: car movement and queuing, trips, spawning, demand, scoring, clock and expansion, upgrades, bridges and tunnels, roundabouts and lights, congestion, unlocks, audio events. Each arrives with its milestone._
