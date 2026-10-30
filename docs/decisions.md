# Decisions

Short log of choices and why. Newest at the bottom.

| Date       | Decision                                                                    | Why                                                    |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| 2026-10-28 | Name the project Overpass_Game everywhere                                   | "Overpass" alone already means the OSM API             |
| 2026-10-28 | Phaser 4 + TypeScript (strict) + Vite                                       | Familiar engine; strict types for AI-written code      |
| 2026-10-28 | Sim is framework-free; Phaser only draws                                    | Deterministic, testable rules; reproducible bugs       |
| 2026-10-29 | TypeScript pinned to 6.x                                                    | typescript-eslint doesn't support TypeScript 7 yet     |
| 2026-10-29 | pnpm 12 workspaces, npm removed                                             | Shared packages without publishing; plan decision      |
| 2026-10-29 | Playwright boot tests use the dev server with `reuseExistingServer` locally | Keeps local runs fast; CI always starts its own server |
| 2026-10-29 | Game `base: './'`                                                           | itch.io zip uploads need relative asset paths          |
| 2026-10-29 | Studio port 5174                                                            | Lets the Studio and game dev servers run side by side  |
