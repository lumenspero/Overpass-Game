# M9 · Visual style: session delta

Covers the M9 and M9a work from the M8 close through the current committed state. Checks run by the author: `pnpm check` passes on the author's machine as of the last commit.

## Done

- **Parking lots and building kinds (M9a):** destinations are 3×3 buildings in a 5×3 lot. Houses stay 1×1. Square and round destination kinds, with the round kind appearing later in the game.
- **Lot entry and exit:** inbound cars use the right-hand lane, outbound cars leave on the other lane. Cars park diagonally, and they turn in the lot rather than cutting corners.
- **Double lots:** a later-game lot with two inlets (near and far) and two buildings. The second building arrives after its delay, and cars use whichever inlet is closer on their route.
- **Lot visuals:** kerb colour and lot gaps tuned for light mode. Road edges and parking lines are visible.
- **Building style (Checkpoint D):** destinations have rounded corners and a lip on their bottom and right edges. Houses keep the flat lip. Ground shadows stay as they were.
- **Palette:** light-mode background, road and kerb colours are set. Terrain and water use the approved palette.
- **Camera:** the furthest zoom-out stops at the edge of the square grid, and panning covers the full grid.
- **Grid scale:** the default grid is 96 × 96 tiles, with a tile of 250 m in Map Studio. Labels in the Studio are sized in tiles (1–20). The real-map panel and the generated-map preview show the same 24 km area, with a 60 px margin.
- **Studio import:** tile-based import thresholds (simplify tolerance, minimum shape area and stroke length, river and coast widths) are scaled to the 250 m tile. Mountains below about 1 km² are dropped as noise.
- **Pixel-ratio and screen-size checks:** done alongside the tile-density work.
- **Checkpoint D (style match):** signed off by the author after comparison with the original.

## Tests

- Lot routing and lanes, both inlets, and the double-lot delay.
- Destination shapes and the demo scenes (lots and buildings).
- Camera zoom limits and clamping.
- Studio: frame geometry, the rotated-frame rule, the preview layout margin, label size limits, and the import conversion and mountain derivation.

## Known gaps, carried forward

- **Roll wiring:** placement of 'roll' into real placement is deferred to M14, with the spawn field.
- **Tulsa map:** `maps/tulsa-oklahoma-united-states.map.json` still holds the old 1000 m import. Re-import at 96 × 96 and export before using it.
- **Draft saving:** in the author's browser, drafts could not be saved, so Studio work lasts only until reload.
- **Not checked in this milestone:** shadows, pins and timers in the flat style, the faint motorway guide style, and the smooth water outlines (terrain drawing from outlines is in M8).

## Decisions

See `docs/decisions.md`, the 2026-11-01 rows: the 250 m tile scale and 96-tile default frame, the scaled import thresholds, and the real-map panel's real-size outline.

## Next

M10: game structure (menu, unlock path, challenge mode, pause and settings, end-of-run screen).
