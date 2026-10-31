# M5 · Upgrades and traffic: session delta

Covers the M5 commits from `M5C1 complete` through `checkpoint B` (76 files, about 6,570 lines added). Tests at the close: sim 166 passing, game 142 passing.

## Done

- **Weekly reward and offers:** each week grants road tiles and offers two different upgrades. The pool is bridge, tunnel, motorway, roundabout, light and destination. Weights are tunable.
- **Bridges and tunnels:** laid as freehand paths, committed on release. Erasing returns stock. Refusals show an on-screen message.
- **Motorways:** elevated links between two ramps, shaped by handles from the drag. Handles can be nudged, and motorways can be selected and deleted with right-click or E. Cars ride the curve at a faster speed. Ramps meet the road at the tile edge, with the road's direction at each ramp. This covers dead-end roads too.
- **Road tool:** select is the default tool, so clicking empty ground lays nothing. Roads are laid with the road tool (F).
- **Roundabouts and lights:** placed on any open land, park or road tile without a building. Mountain, water and locked tiles are refused. A roundabout is a donut with an open centre, and cars drive round it counter-clockwise, keeping right. A light alternates its two axes every 240 ticks, and holds one car at a time.
- **Congestion-aware routing:** each car waiting to enter a tile adds 1.5 steps to routes through it. Trip starts plan with these queues. Mid-road re-plans, triggered by road changes, use them too, leaving out the car's own place in line.
- **Destination upgrades:** placed with U on a destination, up to 3 per destination, each adding 0.5 to its demand rate. Upgraded destinations show gold pips.
- **Growth:** each destination gains 0.25 demand when a new district opens.
- **Rule hooks:** a map passes a list of rules into the sim. The first rule kind unlocks a building colour from a given week, and placement refuses that colour before then.
- **Demos:** six scripted maps in the debug panel, each built so its upgrade is the only way to connect a house to its destination. A hint line shows the key and the action. Pressing a demo once froze the game (the normal test map's buildings were placed on the demo map); fixed.
- **Playtest:** demos and Checkpoint B signed off.

## Known gaps, carried forward

- Undoing an erase that removed a roundabout or light restores the road, but not the control.
- The motorway drag preview starts at the tile centre, so it differs slightly from the placed motorway.
- Cars don't queue on motorways, only at ramps.
- Rule hooks work from data, but no map supplies rules until M6.
- Spec entries are still tagged `approximated`. Their tuned or confirmed status needs to be recorded.

## Where it lives

- `packages/sim/src`: `controls.ts` (roundabouts and lights), `motorways.ts`, `motorway-placement.ts`, `pathfind.ts` (congestion cost), `demand.ts` (destination upgrades and growth), `rules.ts` (rule hooks), `movement.ts` (roundabout paths and light phases), `crossings.ts`, `config.ts`.
- `apps/game/src`: `game/demos.ts` (scripted demos), `game/controller.ts` (presses for each tool), `game/game-scene.ts` (drawing and keys), `view/geometry.ts` (car paths), `view/motorway-view.ts`, `view/crossing-message.ts`, `debug/tuning-panel.ts`.
- Spec: `docs/mechanics-spec.md`, with the sections for each feature above.
