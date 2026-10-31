# CLAUDE.md — Overpass_Game

Browser recreation of Mini Motorways' mechanics, with 25 curated real-world maps. Read `Overpass_Game — Implementation Plan.md` (repo root) for the full plan; the active milestone is the first unchecked one there.

## Naming

- Use **Overpass_Game** in code, packages and docs. "Overpass" alone means the OSM API.

## Commands (run from repo root)

- `pnpm install` — install (pnpm 12.16.1, pinned in `package.json`)
- `pnpm dev` — game dev server (port 5173)
- `pnpm dev:studio` — Map Studio dev server (port 5174)
- `pnpm check` — typecheck, lint, format check, tests, build. Must pass before a milestone is done.
- `pnpm exec playwright install chromium` — once per machine, before `pnpm test`

## Folder map

- `apps/game` — Phaser game (`base: './'`, deployed)
- `apps/studio` — Map Studio (dev only, never deployed publicly)
- `packages/sim` — pure TypeScript game rules and `config.ts`
- `packages/map-schema` — zod schemas, types, migrations
- `packages/map-compiler` — source shapes → compiled grid map
- `packages/render-style` — palettes, sizes, shared drawing helpers
- `tools/` — CLI: compile, validate, seed replays
- `maps/` — `*.map-src.json` (Studio) and `*.map.json` (game); created in M6
- Root — `Overpass_Game — Implementation Plan.md`
- `docs/` — `mechanics-spec.md`, `decisions.md`

## Rules

1. Start each session by reading this file, the active milestone in `Overpass_Game — Implementation Plan.md`, and any spec section it touches.
2. `packages/sim` must not import Phaser, the DOM, or any browser API. Its changes come with Vitest tests.
3. Every gameplay number lives in `packages/sim/src/config.ts`. Add it to `docs/mechanics-spec.md` in the same change, tagged `approximated`.
4. The game never makes network calls to OSM services. It only loads compiled map files.
5. No secrets in the repo. Studio config (contact email, etc.) lives in `.env.local`, which is git-ignored.
6. Stay within the active checkpoint. Don't build ahead into later milestones.
7. At a **checkpoint**, stop and wait for the playtest sign-off before starting the next milestone.
8. Do not create git commits, branches, or pushes unless the user explicitly asks for them in that message.
9. Use no Mini Motorways name, logo, screenshot, or asset anywhere in the repo or its docs.

## Toolchain notes

- TypeScript stays on **6.x** while `typescript-eslint` can't load TypeScript 7 (tracking: typescript-eslint#10940). Don't bump it without checking that `pnpm lint` still runs.
- Keep every tool used by a script in `devDependencies`. CI has no global installs.
