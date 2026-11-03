# M12a · Menu rebuild (sub-milestone)

**Status: in progress.** Step 1 (main menu and carousel) is built. Step 2 (tabbed Options) is built with the settings the game already has. Step 3 is split: 3a (display and menu settings, save schema v2) and 3b (waypoints, hold to erase, touch auto-zoom, zoom level, save schema v3) are built. Step 3c drops the render scale control, and save schema v4 removes its field. Step 4 (tutorial overlay) is built. Sub-milestone of M12 (audio), sitting beside it. Volume and soundscape controls depend on M12's audio buses, so they stay as placeholders until M12 lands.

Goal: rebuild the start menu to match the reference's layout and feel, using original art and our own wordmark. Daily challenges, leaderboards, and the Endless, Expert and Creative modes are out of scope.

**Decisions so far**

- Map select is a carousel. Options is tabbed.
- Tutorial is a short in-game overlay.
- Draw mode toggle sits alongside hold-to-draw, not in place of it.
- The reference's "Audio & Video" tab has no video settings. Night Mode and Colorblind Mode are on that tab, so we follow that arrangement.
- Display follows the reference: Fullscreen and Anti-aliasing. Render scale is dropped (see 3c).
- Credits uses our own team and role list, not the reference's names.

## Scope

- [x] **Main menu:** our own wordmark, Play and Options. No Exit button on the web build.
- [x] **Map select as a carousel:** horizontal cards, each with a round thumbnail drawn from the compiled map, the map name, best score, a short description, and a locked state. The selected card is centred and highlighted, with a Play button below. Keeps the unlock rules, resume and best scores from M10 and M11.
- [x] **Options as tabs:** Game, Audio & Video, Display, Language, Controls, Privacy, Credits, with a back arrow top left.
  - [ ] **Game:** motorway guide (G), touch auto-zoom, zoom level, hold to draw/delete, draw mode toggle (click-to-draw alongside hold-to-draw).
  - [ ] **Audio & Video:** Volume and Soundscape (music, effects and ambience buses, after M12's audio manager), Menu Transitions (on/off), Night Mode (dark mode), Colorblind Mode (building symbols).
  - [x] **Display:** Fullscreen (on/off, via the browser fullscreen API, which needs a tap or click) and Anti-aliasing (the renderer reads this at boot, so a change takes effect after a reload). Render scale is dropped.
  - [ ] **Language:** English only for now. Other languages left out.
  - [ ] **Controls:** read-only summary of the mouse layout (Move, Select/Draw, Delete, Toggle zoom, Pan) plus touch and keyboard. No controller support.
  - [ ] **Privacy:** the save-data panel (export, import, storage note), moved from the main menu.
  - [ ] **Credits:** our own team and role list, the licence notices, the "© OpenStreetMap contributors" attribution, and the CC BY and CC0 credits for sounds. Feeds M15.
  - [x] **Tutorial:** short in-game overlay of four steps, opened from Options and with H during play.
- [ ] Remove `docs/screenshots/` (MM1–MM8, the Mini Motorways reference images) once the new UI is in place. Until then, do not commit them. MM8 duplicates MM5.

## Sim and save changes

- New settings (draw mode, touch auto-zoom, zoom level, and later audio volumes) are gameplay-adjacent. Every value that changes behaviour goes in `packages/sim/src/config.ts` and `docs/mechanics-spec.md`, tagged `approximated`.
- New settings fields change the saved settings. Any change to the save schema needs a `schemaVersion` bump and a migration with a test (M11 rule).

## Done when

- The carousel and tabbed Options run on desktop and touch, and the existing unlock, resume and save-export behaviour still passes its tests.
- Every option listed above is present, either working or marked as a placeholder with the milestone that completes it.
- `pnpm check` passes.

## Step 1 notes

- Built: `ui/menu.ts` (main screen and carousel), `ui/carousel-model.ts` (+ test), `ui/map-thumbnail.ts`. `main.ts` passes the theme.
- Card description is not shown: the campaign data has no description text yet. Add it with the M14 content.
- The save section is still on the main screen. It moves to Privacy in step 2.
- The challenge list has left the menu. It returns when M14 adds challenges.
- Test maps: Los Angeles is in the campaign list after Tulsa, from the Studio export. `apps/game/src/dev-flags.ts` has `showAllMaps`, which is on in dev so every card opens for layout checks. It is off in production builds.
- Checked: `tsc --noEmit` passes, Prettier and ESLint pass on the changed files, and the carousel rules pass a direct run.
- Not yet checked: the Vitest suites (the sandbox lacks the rolldown native binding), and the layout and touch behaviour in a browser.

## Step 2 notes

- Built: `ui/options-screen.ts`, which replaces the old settings modal (`settings-screen.ts`, now deleted; nothing imports it). The menu's save section moved to Options > Privacy.
- Real now: motorway guide, night mode, colourblind mode, fullscreen (browser API; the host may refuse it).
- Shown disabled, for step 3 or M12: draw mode toggle, hold to draw/delete, touch auto-zoom, zoom level, menu transitions, render scale, anti-aliasing, volume and soundscape (M12), tutorial button.
- Controls lists the controls from `input/intents.ts` and the keyboard handlers in `game-scene.ts`.
- Credits has placeholders for team names and sound credits.

## Step 3a notes

- Save schema is now version 2. Settings gain `renderScale`, `antiAliasing` and `menuTransitions`. The v1 to v2 migration gives existing saves the defaults that match the old game (100%, anti-aliasing on, transitions on). Tests cover the migration and a null settings block.
- Anti-aliasing is wired: the game's `antialias` config reads it at each game start, so it applies from the next game.
- Menu transitions fade the menu screens in when on. The menu reads the setting each time a screen opens.
- Render scale was blocked: Phaser 4.2.1's game config has no render-resolution option. Dropped in 3c (see below).
- Still disabled, for 3b: draw mode toggle, hold to draw/delete, touch auto-zoom, zoom level. Still disabled, for M12: volume and soundscape.

## Step 3b notes

- Save schema is now version 3. Settings gain `drawMode`, `holdToErase`, `touchAutoZoom` and `zoomLevel`. The v2 to v3 migration keeps the old behaviour: drag to draw, hold to erase on, no auto-zoom, zoom 1x.
- Click to draw waypoints (`input/intents.ts`): on the road tool, a click sets the start, then each click lays road from the previous point. A drag still draws and ends the chain. Right-click, Esc, and any pan or zoom also end it. Esc and wheel are handled in `game-scene.ts`.
- Hold to draw/delete: a switch, on by default. Off, a still touch places a tile instead of erasing.
- Touch auto-zoom: after a touch stroke, the camera fits the stroke's screen extent (`fitBox` in `view/camera.ts`). Strokes shorter than 24 px are taps and do not zoom. Default is off, which keeps the old behaviour.
- Zoom level: 1x, 1.5x or 2x the fit-to-screen zoom, applied when the camera fits. Applies from the next game.
- Tests: `input/waypoints.test.ts`, camera zoom and `fitBox` tests, and settings and save fixtures. The waypoint and hold rules also passed a direct Node run. Vitest and a browser check are still to do.
- Decision for you: auto-zoom is off by default, which differs from the reference (checked there). Say if it should be on by default.

## Step 3c notes

- Render scale is dropped, at your request. The Display tab no longer has the control.
- Save schema is now version 4. `DROP_RENDER_SCALE` (v3 to v4) removes the `renderScale` field from saved settings. Tests cover the migration and the fixtures.
- The earlier steps (75%, 100%, 150%) are no longer used.

## Step 4 notes

- Built: `ui/tutorial.ts` is a DOM overlay with four steps (draw roads, connect buildings, pan and zoom, weeks and overflow), with Back, Next, Done and Skip. Escape closes it. Left and right arrows move between steps, and those keys stop at the overlay so the map does not pan behind it.
- Opened two ways: Options > Tutorial (the disabled row is now an Open button; closing returns to Options), and H during play. Game-scene H pauses the clock and restores it on close only if it was running before.
- Defaults chosen here, to confirm: the overlay re-opens from Options and H at any time; it does not show on first run; text covers the controls in `input/intents.ts` and the waypoint option.
- Not yet checked in a browser: layout at phone width, the H pause and resume, and that the overlay closes on Escape with the map behind it still.

## Decisions

- A reload after an anti-aliasing change is acceptable.
- No video settings: the reference has none, so none are planned.

## Open questions

- [ ] Tutorial: confirm the default that it does not auto-show on first run.
