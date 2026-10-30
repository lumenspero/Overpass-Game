# Overpass_Game

A free browser game that recreates Mini Motorways' mechanics, with 25 curated maps of real continental-US places.

Status: M0 (repository foundation). See `docs/PLAN.md`.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
```

## Scripts

| Command           | What it does                                |
| ----------------- | ------------------------------------------- |
| `pnpm dev`        | Game dev server                             |
| `pnpm dev:studio` | Map Studio dev server (not deployed)        |
| `pnpm check`      | Typecheck, lint, format check, tests, build |
| `pnpm build`      | Production builds of both apps              |

See `CLAUDE.md` for conventions and the folder map.

## License

Code MIT; art and audio CC BY 4.0; map data ODbL 1.0. Map data © OpenStreetMap contributors. Details arrive with `LICENSE` in M15.
