# M13 · Mobile and performance: session delta

**Status: complete for desktop**, signed off by the author on 2026-11-04. Mobile items and device tests are deferred until after M14, as recorded in `docs/decisions.md` (M13 · Deferrals).

Covers M13 from the M12 close through the current committed state. Checks run by the author: the 300-car demo was checked in a desktop browser, with the debug line (D) and DevTools traces. Automated checks run for this delta: the sim suite (31 files, 246 tests) and the game suite (49 files) pass; typecheck, ESLint and Prettier are clean on the changed files.

## Done

- **Weekly offer:** six options, each an upgrade with tiles (motorway 10, bridge, roundabout and tunnel 20 each, two traffic lights 20, road tiles alone 30). The option's tiles replace the fixed weekly 20 tiles. Weighted draw per option, with a per-map `allowedOffers` rule set in the Studio. The clock pauses while an offer waits.
- **Crossings and roundabouts:** bridges and tunnels are placed automatically where a road crosses water or mountain. Dragged icons sit at half a road tile. Roundabouts are two tiles across and circulate counter-clockwise, with road arms meeting the ring's outer edge.
- **Joining traffic and lot turns:** cars wait to join only when their lane is clear and no car will reach the join within `CAR_GAP`. Crossing the other lane waits for moving or approaching cars. Houses are entered and left from the car's own lane. Lot inlets were reworked so cars don't swing back against their direction, and a leaving car waits just inside the lot so two full lots on one road can't lock each other. Patience rules (5 s, then 10 s in gridlock) keep a jam from locking for good.
- **300-car demo:** five streets with 300 cars kept on them, starting full, with the car count held near 300 as trips finish. The debug line shows average and worst frame and sim times over the last 120 frames.
- **Performance:**
  - sim tick about 1.5 ms with 300 cars, down from 5.8 ms, with the same results (6,000-tick demo run: 1,946 trips);
  - a tile index used while cars move;
  - spawn counts computed once per tick;
  - a cached lot-exists check;
  - the frame meter uses wall-clock intervals, since Phaser caps `delta` under load;
  - car outlines are drawn as triangle fans, and headings use two batched shape calls per frame.

## Tests

- Sim: 31 files, 246 tests. New `joins.test.ts` covers joining, crossing, patience, the forced merge in gridlock and the rule that a moving car is never cut in on.
- Game: 49 files pass. Geometry test for the house bend updated to the lane-point curve.
- Demo: `addDemoCarOnRoute` places the starting cars, and the demo test covers the 300-car start.

## Performance measurements

| Trace                           | Frames | Mean frame | Main thread busy |
| ------------------------------- | ------ | ---------- | ---------------- |
| Before triangle fans (67a8c086) | 210    | 33.5 ms    | 98%              |
| After triangle fans (366471d5)  | 193    | 34.8 ms    | 99%              |

The triangle fans gave no measurable gain. The author signed off the performance for this milestone. The 60 fps target on a mid-range phone is not measured yet (deferred).

## Known gaps, carried forward

- **Mobile layout:** the responsive HUD, tap targets, safe-area insets and orientation handling. Deferred to after M14.
- **Device tests:** iPhone, Android and touchscreen laptop, plus the M2 phone check of drawing roads with touch. Deferred to after M14.
- **Offer popup and dock status:** not verified in the browser.
- **Renderer cost:** most of the frame is Phaser's WebGL command processing. Per-frame fills in `drawMotorways()` (the motorway badges, through `fillPoints`) may account for some of the earcut time; not confirmed.
- **Car drawing allocations:** `carOutline` still allocates its points each frame.
- **Game Playwright port:** the game's test server is still on 5173, so it can reuse a running Studio server (carried from M8).

## Decisions

See `docs/decisions.md`, the M13 rows: weekly offer, map offer restrictions, crossings and roundabouts, 300-car check, joining traffic and lot turns, performance budget, and deferrals.

## Next

M14 · Content production: the spawn field for houses and destinations, the Studio rules panel moved from M8, the 25 locations and their unlock order, the 22 remaining maps, the challenge set, and the balance pass. Mobile items follow M14.
