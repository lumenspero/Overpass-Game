import { describe, expect, it } from 'vitest';
import {
  MUSIC_TRACKS,
  SOUND_CATALOG,
  SOUND_EVENTS,
  musicUrl,
  soundCreditLines,
  soundSourceUrl,
  soundUrl,
  type SoundSource,
} from './catalog.ts';

const allSources: SoundSource[] = [
  ...SOUND_EVENTS.map((event) => SOUND_CATALOG[event].source),
  ...MUSIC_TRACKS.map((track) => track.source),
];

describe('sound catalog', () => {
  it('has one entry for every event', () => {
    for (const event of SOUND_EVENTS) {
      expect(SOUND_CATALOG[event]).toBeDefined();
    }
  });

  it('gives every game file a unique name', () => {
    const files = [
      ...SOUND_EVENTS.map((event) => SOUND_CATALOG[event].file),
      ...MUSIC_TRACKS.map((track) => track.file),
    ];
    expect(new Set(files).size).toBe(files.length);
  });

  it('keeps the Freesound details for attribution', () => {
    for (const source of allSources) {
      if (source.kind !== 'freesound') continue;
      expect(source.freesoundId).toBeGreaterThan(0);
      expect(source.title).not.toBe('');
      expect(source.creator).not.toBe('');
      expect(source.archive.startsWith(`${source.freesoundId}__`)).toBe(true);
    }
  });

  it('names the generator entry for each generated tone, matching its file', () => {
    for (const event of SOUND_EVENTS) {
      const { file, source } = SOUND_CATALOG[event];
      if (source.kind !== 'generated') continue;
      expect(file).toBe(`${source.name}.wav`);
    }
  });

  it('uses a generated tone for every sound effect', () => {
    for (const event of SOUND_EVENTS) {
      expect(SOUND_CATALOG[event].source.kind).toBe('generated');
    }
  });

  it('builds the Freesound link', () => {
    expect(soundSourceUrl(MUSIC_TRACKS[0].source)).toBe(
      'https://freesound.org/s/518198/',
    );
  });

  it('builds the game URLs from the base URL', () => {
    expect(soundUrl('menu.enter', '/')).toBe('/audio/sfx/menu-enter.wav');
    expect(soundUrl('map.next', '/overpass/')).toBe(
      '/overpass/audio/sfx/map-next.wav',
    );
    expect(musicUrl(MUSIC_TRACKS[0], '/')).toBe(
      '/audio/music/music-synth-pad-chords.mp3',
    );
  });

  it('credits each Freesound source once and leaves out generated tones', () => {
    const lines = soundCreditLines();
    expect(lines.length).toBe(new Set(lines).size);
    // Only the seven music tracks: every effect is generated.
    expect(lines.length).toBe(7);
    expect(lines.some((line) => line.includes('nnaudio, CC BY 4.0'))).toBe(
      true,
    );
    expect(lines.some((line) => line.includes('Hi-Tech Click'))).toBe(false);
  });
});
