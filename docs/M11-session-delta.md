# M11 · Persistence: session delta

Covers M11 from the M10 close. Progress, best scores and settings are saved, a campaign run is saved and can be resumed, and a save can be exported and imported. Storage that is blocked falls back to memory.

## Done

- **Save format (`packages/map-schema/src/save.ts`):** one bundle holds the settings, the best trips per play, and one run in progress per campaign map. It carries `format` and `schemaVersion` (1). A newer version is refused. Migrations run one version at a time (`SAVE_MIGRATIONS`, none yet). The zod schema checks the grid-sized arrays and the counters of each saved sim, and it keeps every other field as the sim wrote it. `SIM_STATE_KEYS` names every field of `SimState`, and a test fails if the sim gains a field the save does not name.
- **Storage (`apps/game/src/save/store.ts`):** IndexedDB through `idb-keyval`, one record. A store that can't open, read or write falls back to memory for the page's life and reports it once. A blocked open times out after 3 s.
- **Progress (`apps/game/src/game/progress.ts`):** the one place progress lives. It loads before the menu or a game starts (`initProgress`), and writes the whole bundle after each change. Unreadable saved data is kept under its own key. `saveRun`, `loadRun`, `clearRun` and `recordFinishedRun` manage runs; a finished run is removed.
- **Autosave and resume:** the scene saves at each week boundary, when the page is hidden, and when a game is left for the menu (`game-scene.ts`, `run-resume.ts`). The menu offers Resume on a map with a saved run. A resumed run starts paused, at 1×. A map whose content hash has changed discards its saved run, with a message.
- **Export and import (`apps/game/src/save/codec.ts`, `apps/game/src/ui/save-panel.ts`):** the file is the bundle as JSON. The code is `OG1.` plus URL-safe base64 of the zlib-compressed JSON, made with `fflate`. Import accepts either, validates it, and asks before it replaces progress.
- **Menu:** a storage note when progress is memory-only, Resume rows, and a Save data section.
- **Settings:** now saved with the progress (`settings.ts` reads and writes through `progress.ts`).

## Tests

- `packages/map-schema/tests/save.test.ts`: valid bundles, missing fields, grid-size mismatches, key mismatches, bad hashes and themes, unknown fields kept, a newer version refused, the migration chain, and `SIM_STATE_KEYS` against `createSim`.
- `packages/sim/tests/save-roundtrip.test.ts`: a town saved mid-run through JSON and continued produces the same state as the original.
- `apps/game/src/save/codec.test.ts`: codes and files round trip, pasted codes with whitespace read, and damaged, foreign and invalid input is refused with a clear message.
- `apps/game/src/save/store.test.ts`: memory copies, the fallback on read and write failure, the timeout, and no IndexedDB in Node.
- `apps/game/src/game/progress.test.ts`: best scores, run save and load (copies), saved weeks, a finished run removes its save, settings and runs across a reload, blocked storage, unreadable data kept aside, export and replace.
- `apps/game/src/ui/menu-model.test.ts`: the saved week on a campaign row.

## Checks

- Typecheck: sim, map-schema, map-compiler, render-style, game and studio pass.
- Lint and format: clean.
- Unit tests: sim, map-schema, map-compiler, render-style, game and studio pass.
- Game production build: passes.
- Not run: the Playwright boot tests (no browser in the build sandbox), and `pnpm check` itself (the sandbox's disk was full, so the same steps were run directly).

## Not verified in a browser

- A reload mid-game resumes the run, paused, at the saved week.
- An export made on one host imports on the other (itch.io and the domain).
- Blocked storage in private browsing, and in the itch.io iframe.
- Save-and-leave to the menu, and the pagehide save, in a real page.

## Decisions

See `docs/decisions.md`, the 2026-11-02 rows from "Progress is one save bundle" to the `idb-keyval` row. The spec's Persistence section lists the rules.

## Carried forward

- The M10 gaps stand: the challenge list and goals (M14), campaign runs on real maps (M14), and the campaign order (M14).
- Audio (M12) is not in settings yet.
- Whether a saved run is still playable after a sim change is not checked beyond the schema. Any change to the sim's state needs a migration.

## Next

M11's browser checks, then M12 at Checkpoint E.

## After M11: play controls and top bar

- **Top bar (`apps/game/src/ui/top-bar.ts`):** back to the main menu top left; trips with a pin, the day and a clock top right. The clock opens a transparent Play, Pause and 2× menu (`ui/top-bar-model.ts`). The bar covers only its own controls, so the map keeps touch and mouse input.
- **Calendar (`apps/game/src/view/calendar.ts`):** seven equal days per week, Monday first; the dial turns twice per day and inverts in the second half. Display only.
- **Removed:** the bottom-left play bar (`speed-bar.ts`), the centre HUD line (`hudLine`), and Settings in play. Settings stays in the main menu.
- **Tests:** `view/calendar.test.ts`, `ui/top-bar-model.test.ts`. The HUD test keeps only the end-screen cases.
- **Not checked in a browser yet:** the look and touch behaviour of the top bar, and the clock menu closing on an outside press.
