import { describe, expect, it } from 'vitest';
import {
  MUSIC_TRACKS,
  SOUND_CATALOG,
  SOUND_EVENTS,
  musicUrl,
  soundCreditLines,
  soundSourceUrl,
  soundUrl,
} from './catalog.ts';

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
    const sources = [
      ...SOUND_EVENTS.map((event) => SOUND_CATALOG[event].source),
      ...MUSIC_TRACKS.map((track) => track.source),
    ];
    for (const source of sources) {
      expect(source.freesoundId).toBeGreaterThan(0);
      expect(source.title).not.toBe('');
      expect(source.creator).not.toBe('');
      expect(source.archive.startsWith(`${source.freesoundId}__`)).toBe(true);
    }
  });

  it('builds the Freesound link', () => {
    expect(soundSourceUrl(SOUND_CATALOG['game.over'].source)).toBe(
      'https://freesound.org/s/497702/',
    );
  });

  it('builds the game URLs from the base URL', () => {
    expect(soundUrl('menu.next', '/')).toBe('/audio/sfx/menu-next.wav');
    expect(soundUrl('menu.next', '/overpass/')).toBe(
      '/overpass/audio/sfx/menu-next.wav',
    );
    expect(musicUrl(MUSIC_TRACKS[0], '/')).toBe(
      '/audio/music/music-synth-pad-chords.mp3',
    );
  });

  it('lists each source once in credits: seven effects and seven music tracks', () => {
    const lines = soundCreditLines();
    expect(lines.length).toBe(new Set(lines).size);
    expect(lines.length).toBe(14);
    expect(lines.some((line) => line.includes('miksmusic, CC BY 3.0'))).toBe(
      true,
    );
    expect(lines.some((line) => line.includes('nnaudio, CC BY 4.0'))).toBe(
      true,
    );
  });
});
