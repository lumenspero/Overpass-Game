# M6 · Map schema and compiler: session delta

Covers the M6 work from the M5 close through the committed M6 state. All checks passed at close (`pnpm check`).

## Done

- **Schemas (`packages/map-schema`):** zod schemas for source maps, compiled maps and save files. Types are inferred from the schemas. A failed parse throws `MapFormatError`, which names each bad field, e.g. `layers.water.0.width: a stroke needs a width`.
- **Compiler (`packages/map-compiler`):**
  - Closed and stroked shapes become tiles, using a centre-in-shape rule (closed) or half-width distance (stroke).
  - Terrain layers paint in order: parks, mountains, water, with later layers winning.
  - Districts default to 0. Spawn weights apply only to land and park tiles.
  - Outlines are sampled into points in grid units.
  - The motorway guide is clipped to the grid as polylines. Starter roads become tile runs.
  - A content hash (FNV-1a, 32-bit) identifies a map version.
- **Map files:** `maps/test.map-src.json` is the M5 test map written as shapes. `maps/test.map.json` is its generated output, checked in. `pnpm compile-maps` regenerates it. `--check` fails on a stale file.
- **Fixtures:** `packages/map-compiler/tests/fixtures/coast.map-src.json` covers a curved bay, a stroked river, a starter road and a rule.
- **Game:** loads the compiled test map. Rules are passed to the sim. The motorway guide draws under the roads and toggles with `G` (on by default, hidden on demo maps).
- **Dev scripts:** `pnpm dev` and `pnpm dev:studio` run Vite directly via `node`, not through pnpm's batch wrappers. On Windows this reduces Ctrl+C to one prompt.
- **Docs:** the plan is now one root file, `Overpass_Game — Implementation Plan.md`. CLAUDE.md and README.md point to it.

## Tests

- Schema: valid source, stroke without width, closed shape with too few points, wrong schema version, terrain length, non-adjacent path tiles, save hash.
- Compiler: coast snapshot (terrain picture, districts, spawn, guide, starter road, rules). Test map matches the M5 hand-built grid tile for tile. Committed `test.map.json` matches its source. Spawn weight never lands on water. Hash changes with content. Path walking and guide clipping.
- Game: guide scaling, settings toggle.

## Known gaps, carried forward

- The spawn field is compiled but nothing reads it yet. Spawning waits for M14.
- Starter roads are compiled but not used. Challenge mode arrives in M10.
- Test-map buildings are still listed by hand in `test-map.ts`.
- Settings (the guide toggle) live in memory only. The settings screen arrives in M10 and saving in M11.
- The coast snapshot shows the guide as a clipped polyline. It should be reviewed by eye, since the diff is not easy to read.
- Spec entries have no new gameplay numbers this milestone, so `mechanics-spec.md` is unchanged.
- The `tools` package depends on `tsx`, which depends on `esbuild`. `pnpm-workspace.yaml` has `allowBuilds: esbuild: false`. That works because esbuild ships its platform binary as an optional package. Switch to `true` if esbuild errors appear.

## Decisions (see docs/decisions.md, M6 rows)

- Source maps list district regions, not `startCols`/`growthSchedule`.
- Terrain layers paint parks, then mountains, then water.
- Spline handles are offsets from their point.
- A tile belongs to a shape when its centre is inside it (closed) or within half the width (stroke).
- The content hash is FNV-1a, 32-bit.
- Compiled `maps/*.map.json` is generated and checked in. A test fails when it is stale.
- The motorway guide is a clipped polyline, not tile runs, because tile runs drew stair-steps.

## Where it lives

- `packages/map-schema/src`: zod schemas and parsers.
- `packages/map-compiler/src`: compiler, clipping, `toSimMap`.
- `tools/src/compile.ts`: the `compile-maps` CLI.
- `maps/`: `test.map-src.json` (source) and `test.map.json` (compiled).
- `apps/game/src/game/test-map.ts`: loads the compiled map.
- `apps/game/src/game/settings.ts`: in-memory settings.
- `apps/game/src/view/guide.ts`: guide scaling.
- `packages/render-style/src/index.ts`: `GUIDE_STYLE`.

## Next: M7 (Studio: search and OSM import)

Proposed split into three sub-checkpoints, not yet agreed:

1. Place search, bounding box check, frame draw and rotate. Nominatim needs a User-Agent, which browsers can't set, so calls go through a Vite dev-server proxy.
2. Overpass queries for water, coastline, motorways, parks and land use, cached in IndexedDB. Import into simplified, smoothed source shapes.
3. Terrain elevation tiles and the mountain threshold slider.

Dependencies to add: MapLibre GL JS, Preact, Turf, simplify-js, polygon-clipping, osmtogeojson, idb-keyval.
