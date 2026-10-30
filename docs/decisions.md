# Decisions

Short log of choices and why. Newest at the bottom.

| Date       | Decision                                                                    | Why                                                                                                           |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 2026-10-28 | Name the project Overpass_Game everywhere                                   | "Overpass" alone already means the OSM API                                                                    |
| 2026-10-28 | Phaser 4 + TypeScript (strict) + Vite                                       | Familiar engine; strict types for AI-written code                                                             |
| 2026-10-28 | Sim is framework-free; Phaser only draws                                    | Deterministic, testable rules; reproducible bugs                                                              |
| 2026-10-29 | TypeScript pinned to 6.x                                                    | typescript-eslint doesn't support TypeScript 7 yet                                                            |
| 2026-10-29 | pnpm 12 workspaces, npm removed                                             | Shared packages without publishing; plan decision                                                             |
| 2026-10-29 | Playwright boot tests use the dev server with `reuseExistingServer` locally | Keeps local runs fast; CI always starts its own server                                                        |
| 2026-10-29 | Game `base: './'`                                                           | itch.io zip uploads need relative asset paths                                                                 |
| 2026-10-29 | Studio port 5174                                                            | Lets the Studio and game dev servers run side by side                                                         |
| 2026-10-29 | M0 closed before its CI run                                                 | GitHub Actions minutes exhausted this month; `pnpm check` passes locally. Confirm CI green on the first push. |
| 2026-10-29 | Clock carries the fractional tick between calls                             | Tick count depends only on total elapsed time, not on frame size                                              |
| 2026-10-29 | Roads connect by shared edge only                                           | Matches the grid model; no separate connection points                                                         |
| 2026-10-29 | Graph is derived data, rebuilt locally on change                            | Keeps the sim simple; incremental result is checked against a full rebuild                                    |
| 2026-10-29 | Canonical edge direction: smaller endpoint to larger                        | Makes incremental and full builds comparable                                                                  |
| 2026-10-29 | Parks are buildable                                                         | Parks are decorative; spawn-blocking behaviour comes with M3                                                  |
| 2026-10-29 | Input feel constants live in `apps/game/src/input/config.ts`                | Slop, long-press and wheel rate shape gesture reading, not game rules, so they stay out of the sim config     |
| 2026-10-29 | Touch: draw starts after slop; still hold erases; 2nd finger cancels stroke | Keeps draw vs pan conflict-free; a cancelled stroke never reaches the sim                                     |
| 2026-10-29 | Camera math is pure (`apps/game/src/view/camera.ts`); Phaser mirrors it     | Fit, pan and zoom-about-pointer are unit-tested without a browser                                             |
| 2026-10-29 | Resize refits an untouched camera; a moved one keeps its centre             | Rotation shows the whole map until the player takes control, then never yanks the view                        |
| 2026-10-29 | `TILE_SIZE` (32 world units) lives in `render-style`                        | Sizes are shared drawing data for the game and the Studio preview                                             |
