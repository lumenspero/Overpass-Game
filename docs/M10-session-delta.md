# M10 · Game structure: session delta

Covers M10 from the M9 close through the current committed state (C1 to C6, plus the test-map and driveway fixes). Checks run by the author: `pnpm check` passes on the author's machine after each step.

## Done

- **Unlock rules (C1, C2):** a campaign run unlocks the next map when its trips reach `CAMPAIGN_UNLOCK_TRIPS` (default 20, `approximated`). Open and locked maps are derived from the best scores, so nothing else is stored. Campaign and challenge bests are kept apart. The logic is in `packages/sim/src/campaign.ts`.
- **Main menu and map select (C3):** campaign rows in order, open maps as buttons, locked maps with the hint "Reach N trips on <map> to unlock". Each open map shows its best. The challenge list is empty. The test map sits under Other. `?map=<id>` still skips the menu. Files: `apps/game/src/ui/menu.ts`, `menu-model.ts`, `apps/game/src/game/campaign-maps.ts`, `progress.ts`.
- **Pause and speed (C4):** P or the Pause button stops and restarts the clock. A speed change leaves the pause as it is. The HUD shows "Paused" while stopped, and the bar disables itself once the game is over. File: `apps/game/src/ui/speed-bar.ts`.
- **Settings (C5):** motorway guide, dark mode and building symbols, in a screen opened from the menu and from the play bar. In play, the clock pauses while it is open. Building symbols give each building colour one of four shapes, in palette order, in black or white ink picked for contrast. Files: `apps/game/src/game/settings.ts`, `apps/game/src/ui/settings-screen.ts`, `packages/render-style/src/index.ts`.
- **End-of-run screen and best scores (C6):** the panel shows the week, trips, the map's best (with "New best"), and the next map's status. Buttons: Play again, Play next (when open), and Menu. Each campaign run is recorded once, when it ends. Demos and the test map keep no best. Files: `apps/game/src/ui/run-end.ts`, `run-end-model.ts`, `apps/game/src/game/run-actions.ts`, `progress.ts`.
- **Test map (after C6):** the motorway guide fixture line (`guide-1`) is removed from the test map source, and the compiled map is regenerated.
- **Houses (after C6):** a house's road extension (driveway) is drawn as wide as the house. It is view only, and the sim is unchanged.

## Tests

- `packages/sim/tests/campaign.test.ts`: the unlock threshold, chained unlocks, no skipping past a locked map, separate bests, duplicate order rejected.
- `apps/game/src/ui/menu-model.test.ts`: row states, hints, and campaign bests.
- `apps/game/src/ui/run-end-model.test.ts`: test and demo maps, first and worse runs, next map open or locked, last map.
- `apps/game/src/game/settings.test.ts`: defaults, toggles, and the in-memory store.
- `packages/render-style/tests/symbols.test.ts`: symbol order and repeat, ink contrast.
- `apps/game/src/view/hud.test.ts`: the Paused marker; the end summary no longer has its last line.
- `apps/game/src/view/geometry.test.ts`: the driveway width.
- `apps/game/src/debug/tuning-ranges.test.ts`: covers `CAMPAIGN_UNLOCK_TRIPS`.

## Known gaps, carried forward

- **Challenge mode (M14):** the list is empty. No compiled map has starter roads, and the challenge goals (score only, for now) are not built. The plan's challenge item stays unticked.
- **Campaign runs (M14):** the Tulsa map has no buildings until the spawn field arrives, so a campaign run can't end. The unlock path, Play next, and campaign best scores are untested in play. The end screen was checked on the test map.
- **Campaign order (M14):** the list holds only Tulsa. The 25 maps and their order come in M14.
- **Houses (M14):** a house connects only through its fixed entrance tile. Connecting it from any of its 8 neighbours changes the sim's building rules and the road graph, so it is logged in the M14 list.
- **Audio (M12):** not in settings yet. It arrives with the audio manager.
- **Persistence (M11):** settings, best scores and progress are held in memory for each page load.
- **Narrow screens (deferred):** the play bar (bottom-left) may overlap the offer panel, and the menus and panels need a phone pass. Mobile testing is deferred, see the decision log.

## Decisions

See `docs/decisions.md`, the 2026-11-02 rows: campaign unlocks derived from best scores, the menu as DOM, the pause design, the settings screen and symbols, the end-of-run screen, and the driveway and test-map fixes.

## Next

M11: persistence. Save the settings, the best scores, and the run in progress; add save export and import; and fall back when storage is blocked. The M14 items above carry forward.
