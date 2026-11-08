# M14 · Content production: session delta

**Status: in progress.** The campaign content, spawning and unlock chain are in, and the game is being readied for a public repo. The challenge set, the balance pass and Checkpoint F (a full play through the unlock path) are still open.

Covers M14 from the M13 close (2026-11-04) through 2026-11-08. Checks run by the author: playtests on Tulsa, Los Angeles and Pierre, which found most of the fixes listed below. Automated checks run for this delta: the sim suite (307 tests) passed after the last sim change; in the game, the game and save suites (18 files, 109 tests), the UI suite (7 files, 45 tests) and the audio suite (7 files, 34 tests) pass; typecheck, ESLint and Prettier are clean on the changed files. A full `pnpm check` and `pnpm build` were not run in the session.

## Done

### Spawning and houses

- **Business arrivals:** from week 2, on the first tick after the week's reward is chosen, one a week and two every tenth week. Square until week 10; after that an arrival is 50% a new square business, 25% a new round one and 25% a level-up of an existing square one. Every new business arrives with one house of its colour.
- **House moments:** houses come at 1 or 2 moments a week, topping up any colour below the supply band (fewer than 2 houses per business, topped up to 3). The first moment falls early in the week, so a new business is supplied before it can overflow.
- **Placement rules:** spawns are placed by the fence and reach rules (a house within 5 tiles of road or 10 of a building). Spawn zones and weights are gone from the map format and the Studio. Houses stay off lots and off a lot's access tile. A business may not face into another business's lot, or have its access tile on water or mountain.
- **Starting pair:** a played map starts with one house and one business, 5 to 10 tiles apart.
- **Shared stubs:** two houses may share a stub tile. Driveways are drawn as road links, so a bend at a stub is rounded like any other.

### Roads, lots and cars

- **Geometry:** bends are quarter circles of half a tile, with car lanes on the same curve. Lot inlets are drawn as bends where the road turns into them. Cars enter and leave houses and lots on their own lane, turning on quarter circles that follow the road's corner.
- **Lots:** cars queue inside a lot beside taken spaces before backing on to the road. A double lot's far inlet mirrors the near lanes.
- **Roundabouts:** refused where a neighbour holds a building, lot, mountain, water or another roundabout. Cars keep an even speed on and off the ring, and diagonal arms now meet the ring.
- **Traffic lights:** each light switches on the traffic it sees, not a shared timer.
- **Motorways:**
  - a motorway may end on a business's unbuilt inlet, laying that access tile as road;
  - a ring marks the first end while the second is chosen;
  - ramp directions are re-read whenever road links change, closing the jagged gap at a ramp;
  - a car leaving a motorway into a lot approaches from the motorway's tile, which fixed the teleport on Pierre and the business that took pins without cars arriving.

### Demand, fence and controls

- **Demand pins:** up to 9 pins on a business's roof replace the countdown ring, with one large overflow pin. Only pins with no car on the way count toward the limit. Square businesses draw a pin every 300 ticks, and demand grows by 0.1 a week.
- **Fence:** the map opens on a 24 by 14 starting fence that grows 2 wide and 1 high a week, its edge sliding over 1.5 seconds. The camera opens on the fence and never shows past the grid.
- **Controls:** with the default tool, press and drag on empty ground draws road. Placement tools return to the default tool once their piece is built. A road drag that can't finish its bridge or tunnel says why. Run overlays ignore the pointer while a weekly choice is open.
- **Pop-in:** new buildings, level-ups and pins pop in on a damped spring.

### Maps and the Studio

- **23 maps ship**, in the order in `campaign-maps.ts`, rather than the planned 25.
- **Palettes:** the Studio keeps approved palette presets, nine terrain families and a water choice. Label colours are stored per family, mode and region kind, and can be overridden per label.
- **Import:**
  - shapes are trimmed to the grid plus a 4-tile margin and smoothed to 60% detail;
  - rivers compile to one unbroken run of tiles;
  - waterway pieces with the same name and width are stitched together (found on Chicago);
  - the map box covers the whole US, including Alaska and Hawaii.
- **Performance:** rivers are rounded with a disc at each end only, which removed a per-frame cost that slowed all traffic on Pierre.
- **Build:** the production build copies every compiled map into the game. The README explains how to add your own map, playable straight away with `openByDefault`.

### Campaign and unlocks

- **Daisy chain:** the first three maps (Tulsa, Los Angeles, Pierre) are open from the start. Each later map opens when the map before it has a best run of at least that map's `unlockTrips`. Pierre, Seattle and Chicago are set to 500; the rest ramp from 24 to 40.
- **Map select:** a locked card shows "Unlock after N trips in <map>" in place of Play, centred. The dev flag that hid locks is off.

### Menu, Options and identity

- **Name:** the game is now called "Overpass" on screen: the tab title, the start screen, the Credits and the save-code message. The tab icon is a red map pin.
- **Start screen:**
  - a large centred title in Space Grotesk, with Play, Options and GitHub (which links to the repository) centred beneath;
  - behind a light frosted layer, the real game runs a small backdrop board: a squared-oval road loop, one business with its lot and 1 to 5 houses, making real trips;
  - the board uses a random land palette in its dark theme;
  - the backdrop takes no input, plays no sound, never ends and doesn't touch saved runs.
- **Options:**
  - Credits lists Official Release (recommending the original, with a link to Dinosaur Polo Club's page), Licenses and Sounds;
  - a new About tab shows the PaperBound logo, the author's bio, ten earlier projects and a Stripe donate button, which is hidden until its link is set;
  - the Language tab is removed;
  - the tabs are centred, and the scrollbar is thin and dark.

### Public release preparation (pulled forward from M15)

- **Licence and README:** an MIT `LICENSE` at the root. The README now opens with an unofficial-fan-project notice and a link to the official release, and its License section covers code, art and sound, music, map data, font and trademark.
- **Repo rules and layout:** `CLAUDE.md` rule 9 allows naming the original to describe and credit it, while still banning its assets and screenshots. The implementation plan moved to `docs/`.
- **Removed:** the reference screenshots of the original game (`docs/screenshots`). The original Freesound WAVs (`docs/sounds`) are no longer needed; the audio catalog and the stem script note where to download them.
- **History check:** a history check found the screenshots in four commits and `.env.local` in none. The author will strip `docs/screenshots` (and optionally `docs/sounds`) from history with `git filter-repo` before the repo goes public.

## Tests

- **Sim:**
  - `motorway-ends.test.ts` covers a motorway ending at a lot, and the ramp refresh;
  - `lot-access.test.ts` covers access tiles on water and mountain;
  - the campaign tests cover the daisy chain;
  - the map-compiler tests check that a stroke is connected.
- **Game:**
  - `campaign-maps.test.ts` checks that every listed map exists, that the first three are open by default, and the unlock thresholds;
  - `motorway-lot-ride.test.ts` covers the lot approach from a motorway;
  - `title-scene.test.ts` checks that the backdrop's loop closes, that 40 seeds each get one business and 1 to 5 houses, that six 4,000-tick runs complete trips without ending, and that all nine land palettes are drawn.
- **Headless map check:** all 23 maps, 132 businesses checked, none unreachable.

## Known gaps, carried forward

- **Browser checks:** none of this session's interface work has been seen in a browser yet: the start-screen backdrop and its framing on wide and tall windows, the frost, the About tab, the centred tabs and scrollbar, and the GitHub button.
- **Stripe link:** `STRIPE_DONATE_URL` in `options-screen.ts` is empty, so the donate button is hidden.
- **Unlock thresholds:** Pierre, Seattle and Chicago are at 500 trips; the balance pass should confirm or change them.
- **Re-imports:** maps imported before waterway stitching may need re-importing to pick up joined rivers.
- **Music stems:** each track's three stems look like the same file, judging by byte size; worth checking before release.
- **Studio rules panel:** grid size, growth, colours, timing and upgrade pool are still not in the Studio.
- **Mobile layout and device tests:** still deferred from M13.

## Decisions

See `docs/decisions.md`: the M14 Part 1 and Part 2 sections, and the rows from 2026-11-05 to 2026-11-08 (fence, palettes, imports, demand, controls, the 23-map campaign and daisy chain, motorway and roundabout fixes, access-tile rules, credits, and the start-screen backdrop).

## Next

Finish M14: the challenge set with starter roads, the balance pass with fast-forward and recorded seeds, and Checkpoint F, a play through the full unlock path. Then M15 · Release: production builds (itch.io and Cloudflare Pages), store page and screenshots, and making the repo public once its history is clean.
