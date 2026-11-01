# M7 · Studio: search and OSM import: session delta

Covers the M7 work from the M6 close through the committed M7 state (`ce024b8`). All Studio checks passed: typecheck, lint, format, 94 Studio unit tests and the Studio build. The full `pnpm check` also runs the Playwright specs, which were not run in the build sandbox.

## Done

- **Layout (`apps/studio`):** a MapLibre real-map panel beside a game-style preview canvas. Both follow the same frame.
- **Place search:** Nominatim through the dev-server proxy. Submit-only, at most one request per 1.1 s, with the contact from `NOMINATIM_CONTACT` in `.env.local`.
- **Frame:** a continental-US bounding-box check, drag to draw (the release now commits even outside the map), and a turn slider with reset. Frames are 16 to 96 tiles per side, 1000 m per tile.
- **Overpass import:** water (lakes, reservoirs, riverbanks, rivers and canals as strokes, coastlines as strokes), parks (`leisure=park` and forest, grass, meadow, recreation ground, village green), and motorway and trunk roads as a guide. Queries go through the dev proxy with a fixed User-Agent and a size cap.
- **Cache:** replies are stored in IndexedDB, keyed by the FNV-1a hash of the query text. A changed frame changes the query, so it misses by design.
- **Conversion:** OSM features become simplified, smoothed source shapes tagged `origin: 'osm'`, validated by the map schema.
- **Terrain:** Terrarium elevation tiles at zoom 10, read through the dev proxy and decoded. Each grid tile takes the elevation at its centre, following the frame's turn.
- **Mountain slider:** 0 to 3000 m in steps of 25, starting at 500 m. It recomputes the mountain layer on release. A failed terrain load does not stop the import, and the message says so.
- **Preview:** imported features show only while the frame is the one they were imported for. Mountains draw between parks and water.

## Tests

- Proxies: Overpass and Nominatim request checks; Terrarium tile path parsing, zoom and tile-range limits, and method checks.
- Frame and geometry: frame maths, rotation, projection, Douglas-Peucker simplification, ring area, spline smoothing.
- Conversion: water, parks, rivers and coastlines, motorway guide, outer rings only, source map schema validity, mountains in the mountains layer.
- Terrain: Terrarium decoding, tile indexing, elevation sampling and missing tiles, mountain derivation (one block, separate blocks, threshold inclusive, nothing above threshold, no data, outer edge only).

## Live checks

- Tulsa: search, framing, import and preview confirmed on the author's machine.
- Denver: the frame update was seen on the author's machine. The slider's mountain count is still to be recorded here.
- Not checked live: the terrain load in a browser (the sandbox can't reach the tile host), the cache-hit path, and the terrain-failure message.

## Known gaps, carried forward

- Coastlines are drawn as lines and the sea is not filled. The editor fixes this at M8.
- Multipolygon holes are dropped, for water and for mountains. Painting or editing them is M8.
- Imports stay in memory until M8's autosave.
- The continental box is a bounding box, so it accepts Canadian or Mexican land inside it.
- Terrain is coarse at zoom 10 (about 150 m per pixel against a 1 km grid), so outlines are blocky. A higher zoom is a one-line change if needed.
- Nominatim, Overpass and terrain are dev-only proxies. The Studio has no proxy when built, by design.
- The preview's grid is low-contrast until something is imported. Brightening it was not done.
- Frames at continental zoom clamp to 96 tiles per side.
- Dependencies pinned to older releases by policy: Preact 10.29.8 and polygon-clipping 0.15.7 (published December 2023).

## Decisions (see docs/decisions.md, M7 rows)

- Mercator metres, 1000 m per tile. Frame is a rectangle turned in the plane.
- Continental box is a bounding box, not a coastline.
- Nominatim, Overpass and terrain go through dev-server proxies that set the User-Agent.
- Place search is submit-only.
- Preact 10.29.8, and the preview is a 2D canvas, not Phaser.
- Overpass replies are cached by query hash.
- Coastlines are strokes, with no sea fill at import.
- Holes are ignored at import.
- Land use is imported as parks.
- Import tuning and the mountain slider constants live in `apps/studio/src/config.ts`.
- Terrain layers are parks, then mountains, then water.
- Terrain is optional at import. Mountains recompute on slider release, not on every move.

## Where it lives

- `apps/studio/src/app.ts`: screen state, import, slider.
- `apps/studio/src/map/map-panel.ts`: MapLibre panel and frame drag.
- `apps/studio/src/preview/preview-canvas.ts`: game-style preview.
- `apps/studio/src/search/nominatim.ts`: place search.
- `apps/studio/src/osm/`: query, Overpass client, IndexedDB cache, region loader.
- `apps/studio/src/import/`: projection, geometry, conversion, source map.
- `apps/studio/src/terrain/`: Terrarium maths, tile loader, mountain derivation.
- `apps/studio/dev/`: Nominatim, Overpass and terrain proxies.
- `apps/studio/src/config.ts`: authoring constants.

## Next: M8 (Studio: the editor)

Manual cleaning and painting of water, mountains, parks, spawn zones, the motorway guide and starter roads, with export to game JSON. Coastline sea fill and multipolygon holes come with it. Autosave is also part of M8.
