# Overpass\_Game — Implementation Plan

Oct 28, 2026 · @Brett

## Overview and decisions

Overpass\_Game is a free browser game that recreates Mini Motorways' mechanics as closely as possible, with 25 curated maps of real continental-US places built in a private Map Studio from OpenStreetMap data. It ships as one static build to itch.io and to your own Cloudflare site, with local save persistence and no online features.

**Decisions made so far**

| Area           | Decision                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name           | Overpass\_Game in code, packages and docs, so "overpass" alone always means the OSM API                                                                          |
| Engine         | Phaser 4, TypeScript (strict), Vite                                                                                                                              |
| Mechanics      | Match the original as closely as possible; every constant approximated, documented and tuned at your playtest checkpoints                                        |
| Art            | Close to the original's flat, minimal style; maps converted into that style; all assets original                                                                 |
| Audio          | In scope: sound effects plus calm looping music, structured so it can react to game activity                                                                     |
| Platforms      | Desktop mouse, touch, and mobile from the start                                                                                                                  |
| Online         | None. No daily challenges, leaderboards or cloud saves                                                                                                           |
| Persistence    | Local (IndexedDB) with save export/import                                                                                                                        |
| Modes          | Sequential map unlock campaign, plus a parallel challenge mode with pre-built starter roads                                                                      |
| Motorway guide | Faint outline of real major motorways, toggleable in both modes                                                                                                  |
| Map Studio     | Private authoring tool: place search, OSM import, bold draggable vector outlines, in-editor painting of water, mountains and other features, export to game JSON |
| Launch content | 25 curated maps                                                                                                                                                  |
| Hosting        | itch.io (zip upload) and Cloudflare Pages                                                                                                                        |
| Licensing      | Code MIT; art and audio CC BY 4.0; map data ODbL 1.0 (see Licensing)                                                                                             |
| Repo           | Public at release, Studio included as source but excluded from the game build                                                                                    |

## Tech stack

Phaser 4 renders and handles input; all game rules live in a framework-free TypeScript simulation core that Phaser only draws. Phaser 4 is the current stable line (v4.0.0 shipped April 2026 with a rebuilt WebGL renderer and a near-identical API to Phaser 3). Pin exact versions in `package.json` when M0 starts.

| Need                             | Library                                               | Used in                 | Why                                                                       |
| -------------------------------- | ----------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Build, dev server                | Vite + TypeScript (strict)                            | All                     | Fast, simple multi-app setup                                              |
| Workspace                        | pnpm workspaces                                       | All                     | Shared packages without publishing                                        |
| Rendering, input, audio playback | Phaser 4                                              | Game, Studio canvas     | Familiar to you; scenes, cameras, tweens, pointer and multitouch input    |
| Menus, HUD, Studio panels        | DOM + Preact (small)                                  | Game UI, Studio         | Crisp text and accessible UI at any screen size, easier than in-canvas UI |
| Real-world map panel             | MapLibre GL JS                                        | Studio                  | Free vector map, no API key                                               |
| Base map tiles                   | OpenFreeMap (or a self-hosted Protomaps PMTiles file) | Studio                  | Keyless; Protomaps if you want zero third-party dependency                |
| Place search                     | Nominatim (Photon as an alternative for type-ahead)   | Studio                  | OSM-based geocoding; respect 1 request/second                             |
| OSM features                     | Overpass API + `osmtogeojson`                         | Studio                  | Water, coastline, motorways, land use in a bounding box                   |
| Elevation                        | AWS Terrain Tiles (Terrarium PNG)                     | Studio                  | Free elevation to seed mountains                                          |
| Geometry                         | Turf.js, `simplify-js`, `polygon-clipping`            | Studio, map compiler    | Clip, simplify and smooth shapes                                          |
| Curve smoothing                  | Own Catmull-Rom / Chaikin helpers                     | Studio, game renderer   | Rounded rivers and coastlines like the original                           |
| Seeded randomness                | Own mulberry32/sfc32 (about 20 lines)                 | Sim                     | Deterministic runs, reproducible bugs                                     |
| Pathfinding                      | Own A\* on the road graph                             | Sim                     | Needs custom congestion costs                                             |
| Persistence                      | `idb-keyval`                                          | Game, Studio drafts     | Small IndexedDB wrapper                                                   |
| Save compression                 | `fflate`                                              | Game                    | Small export codes and files                                              |
| Validation                       | `zod`                                                 | Map schema, saves       | Catch bad map or save files with clear errors                             |
| Tests                            | Vitest; Playwright for smoke tests                    | All                     | Sim unit tests; one browser boot test per app                             |
| Offline install                  | `vite-plugin-pwa`                                     | Game (Cloudflare build) | Plays offline once loaded                                                 |
| Lint, format                     | ESLint + Prettier                                     | All                     | Keeps AI-written code consistent                                          |

**Not chosen, and why.** PixiJS would also work but adds no benefit over Phaser 4 for this game. A physics engine is unnecessary: cars move along road graph edges, not by physics. Leaflet is simpler than MapLibre but its raster tiles look worse beside the stylized preview.

## Architecture

One pnpm monorepo holds two apps that share four packages; the game never talks to OSM services, it only loads compiled map files.

&#91;embedded content: repo architecture · 2 apps, 4 shared packages\]

Both apps import all four packages (the arrows point at the sim for simplicity); the Studio uses the sim for its "Play this map" button.

```text
overpass-game/
  apps/
    game/            Phaser scenes, input, UI, audio, saves
    studio/          Map Studio (dev only, never deployed publicly)
  packages/
    sim/             pure TS game rules + config.ts, no Phaser/DOM
    map-schema/      zod schemas, types, migrations
    map-compiler/    source shapes -> compiled grid map
    render-style/    palettes, sizes, shared drawing helpers
  maps/              *.map-src.json (Studio) and *.map.json (game)
  tools/             CLI: compile all maps, validate, seed replays
  docs/              mechanics-spec.md, decisions.md
```

**Key rules:** the sim is deterministic and serializable; the view reads state and sends intents; every gameplay number lives in `config.ts`; nothing in `apps/game` makes network calls.

## Map data model

A map exists in two forms: an editable **source map** of smooth vector shapes that only the Studio reads, and a **compiled map** of grid data that the game loads. The compiler is a shared package, so the Studio preview and the shipped game use identical output.

**Source map (`*.map-src.json`, Studio only)**

```ts
interface SourceMap {
  schemaVersion: number;
  id: string; // "tulsa"
  name: string; // "Tulsa"
  region: { bbox: [w, s, e, n]; rotationDeg: number };
  grid: {
    cols: number;
    rows: number;
    startCols: number;
    startRows: number;
    growthSchedule: GrowthStep[];
  };
  layers: {
    water: Shape[]; // rivers, lakes, coast (closed or stroked splines)
    mountains: Shape[]; // impassable without tunnels
    parks: Shape[]; // decorative / spawn-blocking
    spawnZones: Shape[]; // weights for house and destination placement
    motorwayGuide: Polyline[]; // faint real-motorway overlay
    starterRoads: Polyline[]; // challenge mode only
  };
  rules: MapRules; // colors unlocked over time, special rules, upgrade pool
  palette: PaletteId;
  attribution: string; // "© OpenStreetMap contributors" + sources used
  osmImport?: { fetchedAt: string; queryHash: string };
}

interface Shape {
  id: string;
  kind: 'closedSpline' | 'strokeSpline';
  points: { x: number; y: number; handleIn?: Vec2; handleOut?: Vec2 }[];
  width?: number; // rivers
  locked?: boolean;
  origin: 'osm' | 'painted';
}
```

**Compiled map (`*.map.json`, shipped in the game)**

- Grid size, expansion schedule, and per-tile terrain flags (land, water, mountain, park, out of bounds).
- Pre-tessellated smooth outlines for drawing water and mountains, so the game does no geometry work.
- Motorway guide and starter-road tile paths.
- Spawn weight field, rules, palette, attribution.
- A content hash, so saves can detect that a map changed after an update.

**Coordinates.** OSM data is projected once to a local flat plane (Web Mercator, scaled so one grid tile is one unit), then rotated by `rotationDeg` so you can frame a city the way the original frames its maps. All Studio editing happens in grid units after that.

**Save files** store the map id and content hash, the sim state, the RNG state, settings, and a `schemaVersion` with a migration chain.

## Working with AI assistance

Each milestone task below is sized for one AI session: it names its inputs, what to build, and how to verify it. Keep these files in the repo so every session starts with the same context:

| File                                            | Purpose                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` (or `AGENTS.md`)                    | Conventions, commands, folder map, "never do" rules (no OSM calls from the game, no secrets, Overpass\_Game naming) |
| `Overpass_Game — Implementation Plan.md` (root) | This plan, with milestone status ticked off                                                                         |
| `docs/mechanics-spec.md`                        | Every rule and constant, each tagged `approximated`, `tuned` or `confirmed`                                         |
| `docs/decisions.md`                             | Short log of choices and why                                                                                        |
| `packages/sim/src/config.ts`                    | The only place gameplay numbers live                                                                                |

**Rules for every session**

1. Start by reading `CLAUDE.md`, the current milestone, and any spec section it touches.
2. Sim changes come with Vitest tests; nothing in `packages/sim` imports Phaser or the DOM.
3. Finish with `pnpm check` (typecheck, lint, tests) passing and a one-paragraph summary appended to the milestone.
4. New gameplay numbers go into `config.ts` and `mechanics-spec.md` together, tagged `approximated`.
5. At a **checkpoint**, stop and wait for your playtest sign-off before starting the next milestone.

**Checkpoint format.** Each one lists what to play, what to compare against the original, and the spec entries to review. Your feedback updates tags to `tuned` or `confirmed`, and anything that felt wrong becomes a task.

## Milestones

Sixteen milestones in five phases take the project from an empty repo to release, with six playtest checkpoints (A–F) where work pauses for your sign-off. The core game loop is playable on a test map by M4; the Studio exists by M8; content production fills M14.

### Phase 1: Foundation and core simulation

**M0 · Repository foundation**

- [x] pnpm workspace with `apps/game`, `apps/studio`, `packages/sim`, `packages/map-schema`, `packages/map-compiler`, `packages/render-style`, `tools/`
- [x] Vite + TypeScript strict configs, ESLint, Prettier, Vitest, one Playwright boot test per app
- [x] `pnpm check` script; GitHub Actions running it on every push
- [x] `CLAUDE.md`, `docs/PLAN.md`, empty `docs/mechanics-spec.md` with its section list, `docs/decisions.md`
- [x] Vite `base: './'` for the game so the itch.io zip works from day one

Done when: both apps boot to a blank screen and `pnpm check` passes in CI.

> **Status (closed locally, CI pending):** M0 was closed before its CI run because GitHub Actions minutes were exhausted for this month. `pnpm check` passes locally. Confirm a green CI run before the first push that depends on it.

**M1 · Simulation core: grid and roads (headless)**

- [x] Fixed-timestep sim loop (for example 30 ticks/second) independent of frame rate, with pause and speed multipliers
- [x] Seeded RNG; the whole sim state is plain serializable data
- [x] Grid with terrain flags; road placement and removal rules; road-tile budget with refunds
- [x] Road graph built from tiles: nodes at intersections and ends, edges with lengths; incremental updates on edit
- [x] Spec sections: grid, roads, road budget

Done when: tests cover placing, removing and connecting roads, the graph stays correct after random edit sequences, and two runs with the same seed produce identical state.

**M2 · Renderer and input (desktop and touch)**

- [x] Phaser scene that draws sim state only (no rules in the view): terrain, roads with rounded joins and corners
- [x] Input abstraction producing intents (draw road path, erase, pan, zoom) from mouse, touch, and pen
- [x] Touch gestures: one finger draws, two fingers pan and pinch-zoom, long-press or eraser tool erases; mouse: left draws, right erases, wheel zooms
- [x] Camera that fits the map to any screen size and orientation
- [x] Debug overlay: grid, graph nodes and edges, tick rate

Done when: you can draw and erase roads with a mouse, and the debug graph matches what is drawn. Phone and touch-device checks are deferred to the end of this plan.

> **Status (closed on PC):** M2 is closed on desktop. The phone test moved to "Deferred device tests" at the end of the plan.

**M3 · Buildings, cars and trips**

- [x] Houses and destinations by color, with an entrance side that must connect to a road
- [x] Cars belong to houses (count per house `approximated`), drive to a destination with demand, park, then return home
- [x] A\* on the road graph; repath when roads change; cars stranded by deleted roads go home or vanish (spec decision)
- [x] Car movement along edges with spacing, following, and queuing; intersection yielding rules
- [x] Spawning: houses and destinations placed by spawn weights over time (spawns now need an unclaimed demand pin; see M4)

Done when: on a hand-made test map, cars visibly complete trips and queue at busy junctions, covered by sim tests.

**M4 · Demand, failure and scoring**

- [x] Destinations generate demand pins; pins consumed by arriving cars
- [x] Overflow: too many waiting pins starts a visible countdown that resets when served; a full countdown ends the game
- [x] Score as trips completed; clock with weeks; map expansion schedule
- [x] End-of-game state with summary stats (week reached and trips completed)
- [x] Debug panel: live sliders for every `config.ts` value, fast-forward up to 8×

Done when: a full run on the test map can be lost.

> **Status (tests complete):** the loss path is covered by sim tests (`overflow.test.ts`). Checkpoint A is the playtest sign-off, still pending.

> **Checkpoint A · Core loop feel.** Play 3+ runs on the test map beside the original. Review spec sections: car speed, spawn timing, demand rate, overflow timer, week length. Tune with the debug panel and sign off before Phase 2.

### Phase 2: Full mechanics

**M5 · Upgrades and traffic**

- [x] Weekly reward: road tiles plus a choice between two upgrades (pool and weights `approximated`)
- [x] Bridges over water, tunnels through mountains, with their placement rules and length limits
- [x] Motorways: elevated links between two points with ramp ends, faster travel
- [x] Roundabouts and traffic lights, with their effect on intersection flow
- [x] Congestion-aware routing costs so cars prefer clearer routes
- [x] Destination upgrades and growth over time; per-map rule hooks (for example a color unlocking later)

Done when: each upgrade has tests and a scripted demo scenario in the debug menu.

> **Checkpoint B · Mechanics parity · done.** Run each demo scenario, then full games using every upgrade. Mark each spec entry `tuned` or `confirmed`, or file a task.

### Phase 3: Maps and Map Studio

**M6 · Map schema and compiler**

- [x] `zod` schemas for source maps, compiled maps and saves
- [x] Compiler: smooth shapes → tile flags, tessellated outlines, spawn field, guide and starter-road paths
- [x] Game loads compiled maps; motorway guide toggle in game settings
- [x] Two hand-written source maps as fixtures; snapshot tests of compiler output

Done when: the test map runs from compiled JSON and the guide overlay toggles.

> **Status (complete):** the schemas for source maps, compiled maps and saves are zod schemas in `packages/map-schema`, with path-named errors. `packages/map-compiler` rasterises closed and stroked shapes to tiles (centre-in-shape rule), samples outlines, builds spawn weights, clips the motorway guide to the grid as drawn polylines and turns starter-road polylines into tile runs, and writes an FNV-1a content hash. The test map is now `maps/test.map-src.json`, compiled by `pnpm compile-maps` to `maps/test.map.json`; a test proves it matches the M5 hand-built grid tile for tile, and another fails if the committed file goes stale. The game loads that file, passes its rules to the sim, and draws the motorway guide under the roads, toggled with G (on by default, hidden on demo maps). The coast fixture covers curved shapes, a stroke, a starter road and a rule. Deviations from the plan, recorded in decisions.md: districts list regions instead of `startCols`/`growthSchedule`, spline handles are offsets, the spawn field and starter roads are compiled but not used until M14 and M10, and settings are in memory until M10 and M11.

**M7 · Studio: search and OSM import**

- [x] Studio layout: MapLibre real-map panel beside the game-style preview canvas, kept in sync
- [x] Place search (Nominatim, 1 request/second, User-Agent and contact from `.env.local`), with candidates listed on the map
- [x] Continental-US bounding box check; draw and rotate the map frame
- [x] Overpass queries for water, coastline, motorways and trunk roads, parks and land use; responses cached in IndexedDB by query hash
- [x] Terrain tiles decoded to elevation; threshold slider seeds mountains
- [x] Import converts features to simplified, smoothed source shapes tagged `origin: 'osm'`

> **Status (sub-step 1 built, live check pending):** layout, place search, the continental-US box check and frame draw and turn are in place and unit-tested. The build sandbox can't reach Nominatim, the map tiles, or a browser, so run `pnpm dev:studio` with `NOMINATIM_CONTACT` set in `apps/studio/.env.local` and confirm search and framing before sub-step 2.

> **Status (sub-step 2 built, live check pending):** the Overpass import, IndexedDB cache, conversion to smoothed source shapes and the preview of imported features are in place and unit-tested. Overpass and the map tiles can't be reached from the build sandbox, so run an import on your machine before sub-step 3. Sea areas are not filled yet; that is for the M8 editor.

> **Status (sub-step 3 built, live check pending):** terrain tiles are decoded to elevation through the Studio's dev proxy, and the threshold slider seeds mountains. The build sandbox can't reach the terrain tile host, so run an import on your machine and move the slider: mountains should follow high ground, and the import should still finish, without mountains, if the tiles can't be reached.

Done when: searching a city, framing it and importing produces a rough but recognizable map in the preview.

M7 is closed. The Studio can search a US place, frame it and import its water, parks, motorways and terrain as source shapes, with a mountain threshold slider and a game-style preview. Search, framing, import and the preview were checked live on Tulsa, and the frame update on Denver. The slider's Denver count is still to be recorded. The Studio still cannot edit what it imports, so cleaning and painting wait for M8, and imports stay in memory until M8's autosave. Coastline sea fill and multipolygon holes are also deferred to M8. Details are in `docs/M7-session-delta.md`.

**M8 · Studio: the editor**

- [x] Shapes drawn with bold outlines and draggable anchor and handle points; insert and delete points; move, scale and rotate whole shapes
- [x] Paint tools: water (lake, river with width), mountain, park, spawn zone, motorway guide, starter road
- [x] Layer panel with visibility and lock; snapping to grid; multi-select
- [x] Undo/redo for every action; autosaved drafts in IndexedDB
- [ ] Rules panel: grid size, growth schedule, colors and timing, upgrade pool, palette (moved to M14 with the spawn system)
- [x] "Play this map" button that launches the game with the current compile; export to `maps/`

Done when: you can build a complete map from import to playable export without editing JSON.

> **Status (closed except for the rules panel, which moved to M14; Checkpoint C pending):** the editor, drafts, export and Play are in. Sea fill and multipolygon holes stay deferred from M7. The complete-map check needs houses and destinations, which arrive with the M14 spawn field, so a Studio map plays as terrain only until then. Details are in `docs/M8-session-delta.md`.

> **Checkpoint C · First real maps.** Author 2–3 maps yourself. Note what was slow or awkward; fixes become tasks before content production in M14.

### Phase 4: Look, structure, persistence, sound

**M9 · Visual style**

- [x] `render-style` package: palettes per map, colors per building type, line weights, shadows
- [x] Buildings, cars, pins, timers and roads in the flat minimal style; smooth car turns and parking animation
- [x] Water and terrain drawn from tessellated outlines; faint motorway guide style
- [x] Screen-size and device-pixel-ratio checks

**M9a · Parking lots and building kinds** (sub-milestone; the driving behaviour in M9 depends on it)

- [x] Destinations are 3×3 buildings; houses stay 1×1
- [x] Two destination kinds: square (slower demand, starter to mid game) and round (higher demand, mid to late game)
- [x] Parking lots: each building sits on a small lot whose inlet joins the road; a double-building lot (later game) has two inlets, either usable
- [x] Cars stop in front of the building to finish the trip, then turn round and leave through the lot inlet
- [x] Sim, map and Studio changes for footprints, inlets, lot occupancy and pathing into lots

> **Checkpoint D · Style match.** Compare screenshots side by side with the original; adjust palettes and shapes until you sign off.
>
> **Status: complete.** Signed off by the author after the building lip and shadow changes. Details are in `docs/M9-session-delta.md`.

**M10 · Game structure**

- [x] Main menu, map select showing the sequential unlock path, challenge mode list (the challenge list is empty until M14)
- [x] Unlock rules (score thresholds per map, `approximated`)
- [x] Challenge mode: maps with starter roads and their own goals
- [x] Pause, speed controls, settings (guide toggle, color-blind-friendly building symbols; audio deferred to M12)
- [x] End-of-run screen, best scores per map

> **Status (built; challenge mode and end-to-end runs open):** the menu and map select, unlock rules, pause and speed controls, settings and the end-of-run screen are in. Challenge mode is not: its list is empty until M14 supplies maps with starter roads and goals, so that item stays open. Campaign runs can't be finished on the Tulsa map until M14 adds spawns, so the unlock path and campaign best scores are untested in play; the end screen was checked on the test map, which has hand-placed buildings. Audio is left out until M12. Decisions are in the 2026-11-02 rows of `docs/decisions.md`.

**M11 · Persistence**

- [x] Autosave of the current run at week boundaries and on page hide; resume from the menu
- [x] Progress, best scores and settings in IndexedDB; `schemaVersion` with migrations and tests
- [x] Save export/import as a file and as a compressed text code (needed because itch.io and your domain keep separate storage)
- [x] Graceful fallback when storage is blocked (private browsing, itch.io iframe edge cases)

> **Status (complete):** progress, best scores and settings save to IndexedDB as one `schemaVersion`ed bundle. A campaign run saves each week and when the page hides, and the back button saves before returning to the menu. Resume is offered on the map select, and a run that finishes is removed. Export and import use a JSON file or a compressed `OG1.` code, and an import asks before it replaces progress. Storage that is blocked or fails falls back to memory with a note on the menu. Sign-off: a reload mid-game resumes the run (confirmed by the author). The cross-host export and import was not recorded at sign-off. Details are in `docs/M11-session-delta.md`.

Done when: a run survives a reload mid-game, and a save exported on one host imports on the other.

**M12 · Audio** (details in the Audio section)

- [x] **Checkpoint E · Audio sourcing.** Present the sourcing options below; you pick sources and a direction before any assets are added
- [x] Audio manager over Phaser sound: buses for music, ambience and effects; volume settings; mobile unlock on first tap
- [x] Sound effects mapped to sim events through an event bus
- [x] Music loops with layers whose volume follows game state

> **Status (stems built; listening check open):** each track is three MP3 stems (pad, melody, percussion) in `apps/game/public/audio/music/stems/`, made from the Freesound loops by `tools/audio/make-music-stems.py`. The stems come from splitting the recordings (a percussive split and a 250–400 Hz crossover), not from a learned separation model, so they are approximate. The three add back to the original. The melody follows traffic, the percussion follows pin pressure and overflow, and the pad rises through the week. The menu plays the full mix. The seven full-mix MP3s are still in the music folder until the author decides to remove them.

### Phase 5: Platform, content, release

**M13 · Mobile and performance**

- [ ] Responsive HUD, large tap targets, safe-area insets, orientation handling
- [ ] Performance budget: 60 fps with 300 cars on a mid-range phone; object pooling and batched drawing
- [ ] Test on at least one iPhone and one Android device, plus a touchscreen laptop

**M14 · Content production**

- [ ] Pick the 25 locations and their unlock order (variety of water, mountains, grid shapes)
- [ ] Author the remaining 22 maps in the Studio; per-map rules and palettes
- [ ] Challenge set with starter roads
- [x] Houses connect through a free, permanent stub that the player can drag to any of their 8 neighbours (pulled forward from M14 on 2026-11-03; see the Buildings section of the spec)
- [ ] Balance pass using fast-forward and recorded seeds

> **Checkpoint F · Full campaign.** Play through the unlock path; sign off on difficulty curve and each map.

**M15 · Release**

- [ ] Production builds: itch.io zip and Cloudflare Pages (with PWA)
- [ ] Credits and licenses screen, OSM attribution on every map
- [ ] `LICENSE` files, README, contributing notes; strip any local `.env` values; make the repo public
- [ ] itch.io page, screenshots, short trailer GIF

## Audio

Audio is built so it can react to the game whether or not the original's does: the sim emits events, and an audio layer turns them into sound effects and music layers. These options are presented at Checkpoint E in M12, before any assets are added.

**Design**

- **Effects** for road placement and erasing, building spawn, car arrival, pin appearing, overflow warning and countdown, week end, upgrade pick, menu clicks, game over.
- **Music** as 2–4 calm loops of equal length and tempo, split into stems (pad, melody, percussion). Stem volumes follow traffic, pin pressure and week, so the mix thickens as the city grows. In M12 the stems are derived from the existing Freesound loops, since no separate stems were available.
- **Musical effects (optional):** pitch arrival chimes to a scale per building color and quantize them to the beat, so busy traffic sounds like part of the music.
- Format: MP3 only, decided at M12, so one format covers every browser. Loudness normalized; loops joined with a 50 ms crossfade.

**Sourcing options**

| Source                                         | What it offers                                                           | License fit for a public repo                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [Kenney](https://kenney.nl/assets) audio packs | Clean UI and interface sounds                                            | CC0: safe to commit                                                                              |
| [Freesound](https://freesound.org)             | Huge library of individual effects and ambiences                         | Filter to CC0; CC BY works with credits; avoid NC                                                |
| [OpenGameArt](https://opengameart.org)         | Effects and some loops                                                   | Mixed licenses; check each file                                                                  |
| jsfxr / ChipTone                               | Generate your own blips and chimes in the browser                        | You own the output: safe                                                                         |
| Tone.js or a DAW (Ableton, Reaper, LMMS)       | Make your own pads and chimes; Tone.js can even generate them at runtime | You own the output: safe                                                                         |
| Sonniss GDC Game Audio Bundles                 | Large professional free bundles                                          | Royalty-free in games, but raw files likely cannot be redistributed: keep out of the public repo |
| Pixabay music and effects                      | Calm ambient tracks                                                      | Own license limits standalone redistribution: keep out of the public repo                        |
| Commissioned composer                          | Original adaptive soundtrack with stems                                  | You set the license; budget needed                                                               |

**The public-repo catch.** A public repo redistributes every file in it. Use CC0, CC BY, or self-made audio in the repo. Anything with a "use in your game but don't redistribute" license goes in a private asset store pulled in at build time, and the README explains that.

**Recommendation to discuss at Checkpoint E.** Self-made or CC0 effects (Kenney plus jsfxr), and either a commissioned stem-based score or a self-made one in a DAW. Calm, cohesive music is the hardest thing to find off the shelf.

## Licensing and release

Code is MIT; I recommend CC BY 4.0 for your original art and audio, and ODbL 1.0 for the map files, because they are derived from OpenStreetMap. I'm not a lawyer, so a quick check before release is worthwhile.

| Content                                | License         | Notes                                                                                             |
| -------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| Source code (game, Studio, packages)   | MIT             | `LICENSE` at repo root                                                                            |
| Original art, palettes, original audio | CC BY 4.0       | Others may reuse with credit. Choose CC BY-NC 4.0 instead if you want to block commercial reskins |
| Source and compiled maps               | ODbL 1.0        | Derived from OSM data; must stay ODbL and carry attribution                                       |
| Third-party audio                      | Its own license | Listed in `CREDITS.md`; restricted files kept out of the repo                                     |

**Attribution.** "© OpenStreetMap contributors" with a link to the copyright page, shown on each map's loading or info screen and in the credits. The Studio's MapLibre panel shows tile attribution too.

**Trademark distance.** Use no Mini Motorways name, logo, screenshots or assets anywhere, including the store page. Describe the game in your own words.

**Hosting**

- **itch.io:** zip of the game build with relative paths, uploaded as an HTML game; set the viewport size and enable fullscreen and mobile-friendly options.
- **Cloudflare Pages:** same build plus the PWA service worker, with long cache headers on hashed assets.
- Saves don't move between the two hosts automatically; the export/import feature from M11 covers it.

## Risks and open questions

The biggest risks are traffic behavior that feels wrong and slow map authoring; both have dedicated checkpoints.

| Risk                                                             | Mitigation                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Traffic and intersection behavior doesn't feel like the original | Isolated in the sim with tests; demo scenarios; Checkpoints A and B before anything depends on it |
| Authoring 25 maps takes too long                                 | Studio quality gated at Checkpoint C; fix pain points before M14                                  |
| OSM imports are messy (tiny streams, fragmented coastlines)      | Size thresholds, simplification, and hand editing as the expected final step                      |
| Mobile performance with hundreds of cars                         | Budget set in M13; pooling and batched drawing; profile early on a real phone                     |
| Touch input conflicts (draw vs pan)                              | Gesture rules settled in M2, retested in M13                                                      |
| Overpass or Nominatim rate limits during authoring               | Response caching, 1 request/second throttle, small bounding boxes                                 |
| Save format changes after release                                | `schemaVersion`, migrations with tests, map content hashes                                        |

**Open questions (answer when the milestone arrives)**

- [ ] M3: what happens to cars on a deleted road (return home, or vanish)?
- [ ] M10: how are campaign maps unlocked (score threshold per map, or simply finishing the previous one)?
- [ ] M10: should challenge mode have goals beyond score (for example, a tile limit)?
- [ ] M14: which 25 locations, and in what order?
- [ ] M15: CC BY 4.0 or CC BY-NC 4.0 for art and audio?

## Deferred device tests

Run these once the desktop build is signed off. They were moved here from M2, and M13 covers the wider mobile pass.

- [ ] M2: draw and erase roads on a phone with touch, and confirm the debug graph matches what is drawn
