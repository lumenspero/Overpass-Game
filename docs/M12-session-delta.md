# M12 · Audio: session delta

**Status: complete**, signed off by the author on 2026-11-03. Checkpoint E is ticked. Playback was checked in the browser by the author. The house stub fix was confirmed by the author after a fresh page load.

Covers M12 and the M12a items that depend on audio, from the M11 close. Sound effects are all generated tones, and music is Freesound loops split into stems. Every effect is mapped to a sim event or a player action, the volumes are saved, and the credits are updated.

## Done

- **Audio manager (`apps/game/src/audio/audio-manager.ts`):** Web Audio with three buses (music, effects, soundscape), each set from the saved levels (0 to 10, 2 dB a step, `levels.ts`). Audio stays silent until the first tap or key press, then `unlock` resumes it and starts any waiting music. One instance serves the menu and the game (`shared.ts`).
- **Sound effects:** 31 generated WAVs in `apps/game/public/audio/sfx/`, made by `tools/audio/generate-tones.py` (standard library only). The catalog (`catalog.ts`) maps each event to its file and generator entry, and a test checks that each file matches its generator name. All 31 were approved by the author.
- **Sim events (`sim-sounds.ts`):** building spawn, game over, pin appeared, car arrived, overflow started and countdown, week ended.
- **Player actions (`action-sounds.ts`):** road place and erase, motorway place and erase, crossing, control, upgrade pick, place refused, toggles, district opened, new best, map unlocked, save done and notice error. Menu sounds cover enter, back, next and previous, the tutorial tab, the clock, and level select.
- **Throttle (`throttle.ts`):** each effect has a minimum gap, so busy traffic does not stack the same sound.
- **Week-end clock (`week-tick.ts`):** the last 6 game hours of Sunday, before a week ends, tick and tock alternately. Celebrations play 1.3 s after a game over, and a map unlock has its own sound.
- **Music (`catalog.ts`, `music-stems.ts`, `audio-manager.ts`):** seven tracks, each in three MP3 stems (pad, melody, percussion) under `apps/game/public/audio/music/stems/`. The stems start together and loop in step. Their volumes follow the game: the melody follows cars (full at 30), the percussion follows waiting pins and overflow (full at 6, or any overflow), and the pad rises through the week from 60%. The menu plays the full mix. Stems fade over about 1.5 s, and `setStems` skips updates that do not change anything.
- **Stem pipeline (`tools/audio/make-music-stems.py`):** splits each source WAV in `docs/sounds/` into stems that add back to the original (checked to about 1e-16), then loops and encodes them with the same count, gain and crossfade as the full mix. It needs numpy, scipy and ffmpeg.
- **Format:** MP3 only, so one format covers every browser. The OGG plan is dropped.
- **Volume settings (`ui/options-screen.ts`, `settings.ts`):** Options > Audio & Video has Music, Effects and Soundscape steppers. Settings are saved as schema v5. The v4 to v5 migration (`ADD_AUDIO_SETTINGS`) gives 7, 8 and 5 to older saves.
- **Credits:** the list shows each Freesound source once. A note says the music is looped and split into stems, which CC BY asks for. The footer now says our art and sound effects are CC BY 4.0, and the music keeps its own licence. The README's licence line matches.
- **Clean-up:** `game-open.wav` removed, the seven full-mix MP3s removed, `docs/screenshots/` (MM1–MM9) removed, and `settings-screen.ts` deleted in M12a.

## Also this session: house stubs

Houses now keep a free, permanent stub that the player can drag to any of their 8 neighbours. This was pulled forward from M14. It is recorded in `docs/decisions.md` (2026-11-03).

- **Rules:** the stub costs nothing and can't be erased. Erasing over it cuts its links but leaves the stub. A stub that moves leaves no road behind.
- **Taken-over roads:** when a stub sits on a road that was already there, moving it away removes that road and refunds it, if nothing is joined to it. A road that is still joined stays. Cancelling the move restores it.
- **Where it lives:** `packages/sim/src/buildings.ts` and `sim.ts` (`attachStub`, `moveHouseStub`, `ensureHouseStubs`), and the controller in `apps/game/src/game/controller.ts`. Stored on the house as `stub` and `stubAdopted`, so no schema change.

## Tests

- `apps/game`: 281 pass across 46 files, including the audio catalog, sim events, action sounds, throttle, week-end tick, music stems, and the controller stub tests.
- `packages/sim`: 225 pass, including `house-stubs.test.ts`.
- Vitest ran with the rolldown native binding installed alongside the workspace (see `~/rbind`), because the sandbox's install was missing it.

## Checks

- Typecheck, ESLint and Prettier pass on every changed file.
- Playback and the stub fix were checked in the browser by the author. The Options steppers have not been checked in a browser yet.
- Not run in this session: `pnpm check` as a whole (no `pnpm` on the device VM), and the Playwright boot tests.

## Decisions

See `docs/decisions.md`, the 2026-11-03 rows from "The player never places buildings" to the credits footer row. The mechanics spec covers the stub rules and the week length (2700 ticks, 90 s at 1×).

## Carried forward

- **Stem tuning:** the crossover (250–400 Hz) and the stem thresholds are first values. `lofi-bells-145` has no content below 400 Hz, so its pad stem is silent. Tuning is by ear, with the constants in `music-stems.ts`.
- **Credits team list:** still a placeholder (M12a; feeds M15).
- **Phone-width layout:** the carousel, the tutorial overlay and the top bar are not yet checked at phone width (deferred, see the decision log).
- **Tutorial:** the H pause and resume, and Escape with the map behind, not yet checked in a browser.
- **M12a status:** its Audio & Video, Game, Controls, Save Data, Language and Tutorial items are now built. Its Credits item stays open. The doc's status line still says "in progress" and needs updating.
- **M14:** the remaining 22 maps, challenges, and balance.

## Next

M13 (performance). The phone-width checks above are deferred, see the decision log.
