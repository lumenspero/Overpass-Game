# M8 · Studio: the editor: session delta

Covers the M8 work from the M7 close through the current committed state. Checks run by the author: `pnpm check` (typecheck, lint, format, unit tests, Playwright boot tests) passes on the author's machine as of the last commit.

## Done

- **Shapes:** bold outlines, draggable anchors and handles, insert and delete points, move, scale and rotate whole shapes. Shapes can be locked (saved in the map).
- **Paint tools:** lake, river (with width), mountain, park, spawn zone, motorway guide, starter road.
- **Layers and selection:** per-layer visibility and lock (view state, not saved in the map), snapping to grid, multi-select, box select and select-by-length.
- **Undo and redo:** every action, including imports, the mountain slider and layer edits.
- **Autosaved drafts:** one draft per place in browser storage (IndexedDB), saved one second after each edit. Restore and Discard are in Map data. A re-import of a place with a draft asks first.
- **Export and Play:** "Export to maps/" writes the visible layers as `maps/<id>.map-src.json` and `maps/<id>.map.json`. "Play this map" does the same and opens the game at `?map=<id>`. Exports can't use the id `test`.
- **Game side:** the game loads `?map=<id>` and falls back to the test map with a visible message if the map fails to load. Studio maps have no houses or destinations until the spawn field (M14).
- **Terrain drawing in the game:** parks, mountains and water are drawn from their smooth outlines, so the game matches the editor. Tiles still decide play.
- **Destination upgrade removed:** destination demand grows every week by a fixed step. The player no longer places destination upgrades.
- **Game controls:** arrow keys pan, Space and left-drag pan, and the tile grid shows while a build tool is picked.

## Tests

- Editor and geometry: history, ops, hit testing, coordinates, paint, editor behaviour, selection.
- Drafts: round trip, bad input, keys, debounce timing.
- Export: writes files, play link, refuses bad input and the reserved id.
- Game map loading: `?map=` parsing and loading.
- Simulation: weekly destination growth and the colour rules.
- Playwright: boot and map-panel tests. The Studio's test server now runs on port 5180, so it no longer reuses a game server on 5174.

## Known gaps, carried forward

- **Rules panel:** moved to M14 with the spawn system. The colour unlock is still the fixed-week rule in the code, marked in the spec as a stopgap.
- **Business arrival and supply ratio:** specified in `docs/mechanics-spec.md`, built at M14.
- **Sea fill and multipolygon holes:** deferred from M7. Coastlines still draw as lines, and holes are still dropped at import.
- **Buildings on Studio maps:** none until the M14 spawn field, so a Studio map plays as terrain only.
- **Roads and cars:** they still follow tiles, so a road can sit up to half a tile from a smooth edge.
- **Game Playwright port:** the game's test server is still on 5173, so it can reuse a running Studio server.
- **Denver mountain count:** still to be recorded from M7.

## Decisions

See `docs/decisions.md`, M8 rows.

## Next

Checkpoint C: a playtest sign-off after M8. Stop there.
