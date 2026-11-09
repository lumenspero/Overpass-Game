# Overpass

A free browser game about drawing roads so a growing town's cars can get where they are going. It recreates the mechanics of Mini Motorways, with 23 curated maps of real US places.

> **Unofficial fan project.** Overpass is not affiliated with, endorsed by or sponsored by Dinosaur Polo Club. Mini Motorways is a game and trademark of Dinosaur Polo Club. Overpass contains none of its art, sound or code. If you enjoy Overpass, please support the official release: [Mini Motorways by Dinosaur Polo Club](https://dinopoloclub.com/games/mini-motorways/).

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

## Repository

- `apps/game`: the game (Phaser), the part that is deployed.
- `apps/studio`: the Map Studio, for making maps from OpenStreetMap data. Development only.
- `packages/sim`: the game rules, in plain TypeScript. Every gameplay number is in `packages/sim/src/config.ts`.
- `packages/map-schema`, `packages/map-compiler`, `packages/render-style`: the map format, the compiler from Studio shapes to playable maps, and the palettes.
- `maps/`: the Studio sources (`*.map-src.json`) and compiled maps (`*.map.json`).
- `tools/`: command-line tools for compiling maps and making the audio.
- `docs/`: the mechanics spec (`mechanics-spec.md`), the decision log (`decisions.md`), the implementation plan and the session notes.

## Adding your own map

Your own maps are playable as soon as they are added, with no unlock needed. The campaign's 23 maps stay in their order and unlock as described in `docs/mechanics-spec.md`.

### 1. Make the map in the Map Studio

1. Run `pnpm dev:studio` and open the Studio in your browser. The Studio needs this dev server to export maps.
2. Search for a place in the search box. Nominatim names come from OpenStreetMap, so use the name it returns.
3. Click **Draw frame** and drag the area to map. Turn it with the slider if you need to. Frames are 16 to 192 tiles a side and must sit inside the US box shown on the frame panel.
4. Click **Import OpenStreetMap data**. Water, parks, mountains and roads come in as shapes.
5. Optional: click **Smooth shapes** to tidy outlines, and use the mountain slider to set how high a mountain must be to count. Lock or delete any shape you don't want.
6. Optional: in **Rules**, move or resize the starting fence (type its values, or use **Edit on preview** and drag it), choose the upgrade pool, and set the map's pace. Pace fields left blank use the game's defaults.
7. Click **Play this map** to export it and open the game on it straight away, or **Export to maps/** to export without opening the game.

The map's id is the slug of its name, such as `denver-colorado-united-states`. Export writes two files into `maps/`:

- `maps/<id>.map-src.json`: the Studio's source. Edit it in the Studio, not by hand.
- `maps/<id>.map.json`: the compiled map the game reads.

### 2. Make it playable

Add one line to the end of `CAMPAIGN_MAPS` in `apps/game/src/game/campaign-maps.ts`, after the last campaign map:

```ts
{ id: 'denver-colorado-united-states', name: 'Denver', openByDefault: true },
```

`openByDefault: true` opens the map from the start, whatever comes before it. Without it the map would sit behind the campaign's unlock chain.

### 3. Check and build

- `pnpm check` runs the tests, including one that fails if a listed map has no `maps/<id>.map.json` beside it.
- `pnpm build` copies every `maps/<id>.map.json` into the built game, so the map plays from the build as well as in development. The test map is built in and is not copied.
- Commit `maps/<id>.map-src.json`, `maps/<id>.map.json` and the `campaign-maps.ts` change together.

### Notes

- If you change a `*.map-src.json` by hand, run `pnpm compile-maps` to rebuild its `*.map.json`.
- A map's content hash changes when its compiled data changes. A saved run on a changed map is discarded when it loads.
- To put a map in the campaign order instead, insert it where you want, without `openByDefault`. The map before it then needs a `unlockTrips` value: the trips a run on that map needs to open the map after it.
- Keep the attribution line that the compiled map carries. Map data is © OpenStreetMap contributors, under ODbL.

## License

- **Code:** MIT. See [`LICENSE`](LICENSE).
- **Our art and sound effects:** CC BY 4.0. Every sound effect is a tone made by `tools/audio/generate-tones.py`.
- **Music:** one loop from [Freesound](https://freesound.org), Synth Pad Chords by nnaudio, under CC BY 4.0, changed into the game's stems. It is credited, with its creator, licence and link, in the game under Options, Credits, and in `apps/game/src/audio/catalog.ts`.
- **Map data:** © OpenStreetMap contributors, under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Each compiled map carries its attribution line.
- **Font:** Space Grotesk, loaded from Google Fonts, under the SIL Open Font License.
- **Mini Motorways** is a trademark of Dinosaur Polo Club, named here only to describe and credit the original game.
