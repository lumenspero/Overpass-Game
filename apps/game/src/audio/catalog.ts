/**
 * Game audio, mapped from game events and music tracks to the game's file names and their Freesound
 * sources.
 *
 * The file names are the game's own. Each entry also keeps the Freesound id, title, creator and
 * licence, and the name of the archived original in docs/sounds. Credits are built from these
 * entries, so a file can be renamed here without losing its attribution.
 */

export const SOUND_EVENTS = [
  'game.open',
  'menu.level-select',
  'menu.next',
  'menu.previous',
  'clock.select',
  'building.spawn',
  'game.over',
] as const;

export type SoundEvent = (typeof SOUND_EVENTS)[number];

export type SoundLicense = 'CC0' | 'CC BY 3.0' | 'CC BY 4.0';

export interface SoundSource {
  /** Freesound sound id; the page is https://freesound.org/s/<id>/. */
  readonly freesoundId: number;
  /** Title as shown on Freesound. */
  readonly title: string;
  readonly creator: string;
  readonly license: SoundLicense;
  /** The archived original, under docs/sounds. */
  readonly archive: string;
}

export interface SoundEntry {
  /** File name under audio/sfx/ in the game's public folder. */
  readonly file: string;
  readonly source: SoundSource;
}

export const SOUND_CATALOG: Readonly<Record<SoundEvent, SoundEntry>> = {
  'game.open': {
    file: 'game-open.wav',
    source: {
      freesoundId: 788613,
      title: 'Wood Xylophone Soft Music',
      creator: 'el_boss',
      license: 'CC0',
      archive: '788613__el_boss__wood-xylophone-soft-music.wav',
    },
  },
  'menu.level-select': {
    file: 'level-select.wav',
    source: {
      freesoundId: 788612,
      title: 'Village Greeting Wood Xylophone',
      creator: 'el_boss',
      license: 'CC0',
      archive: '788612__el_boss__village-greeting-wood-xylophone.wav',
    },
  },
  'menu.next': {
    file: 'menu-next.wav',
    source: {
      freesoundId: 497711,
      title: 'Hi-Tech Click 1',
      creator: 'miksmusic',
      license: 'CC BY 3.0',
      archive: '497711__miksmusic__hi-tech-click-1.wav',
    },
  },
  'menu.previous': {
    file: 'menu-previous.wav',
    source: {
      freesoundId: 497714,
      title: 'Short Swoosh Transition 1',
      creator: 'miksmusic',
      license: 'CC BY 3.0',
      archive: '497714__miksmusic__short-swoosh-transition-1.wav',
    },
  },
  'clock.select': {
    file: 'clock-select.wav',
    source: {
      freesoundId: 788607,
      title: 'Menu Scroll Mechanical Variation 02 - Games',
      creator: 'el_boss',
      license: 'CC0',
      archive: '788607__el_boss__menu-scroll-mechanical-variation-02-games.wav',
    },
  },
  'building.spawn': {
    file: 'building-spawn.wav',
    source: {
      freesoundId: 497709,
      title: 'Echo Pop 1',
      creator: 'miksmusic',
      license: 'CC BY 3.0',
      archive: '497709__miksmusic__echo-pop-1.wav',
    },
  },
  'game.over': {
    file: 'game-over.wav',
    source: {
      freesoundId: 497702,
      title: 'Crystal Glasses Ding Cheers 1',
      creator: 'miksmusic',
      license: 'CC BY 3.0',
      archive: '497702__miksmusic__crystal-glasses-ding-cheers-1.wav',
    },
  },
};

/**
 * Background music. Each track is looped to about two minutes, then set to the shared level of
 * -21 LUFS. `gainDb` is the change from the measured level, and `loops` is the number of copies
 * joined with a 50 ms crossfade. Files live under audio/music/.
 */
export interface MusicTrack {
  readonly file: string;
  readonly loops: number;
  readonly gainDb: number;
  readonly source: SoundSource;
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    file: 'music-synth-pad-chords.mp3',
    loops: 9,
    gainDb: -1.3,
    source: {
      freesoundId: 518198,
      title: 'Synth Pad Chords - 130bpm - C#min.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518198__nnaudio__synth-pad-chords-130bpm-cmin.wav',
    },
  },
  {
    file: 'music-vibey-synth.mp3',
    loops: 9,
    gainDb: -1.1,
    source: {
      freesoundId: 518644,
      title: 'Vibey Synth 10 - 133bpm - Emin.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518644__nnaudio__vibey-synth-10-133bpm-emin.wav',
    },
  },
  {
    file: 'music-summer-love-keys.mp3',
    loops: 10,
    gainDb: -0.7,
    source: {
      freesoundId: 583356,
      title: 'Summer Love Tyler "Flower" Synth Keys - 80bpm - C',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive:
        '583356__nnaudio__summer-love-tyler-flower-synth-keys-80bpm-c.wav',
    },
  },
  {
    file: 'music-lofi-zelda-bells.mp3',
    loops: 8,
    gainDb: -1.2,
    source: {
      freesoundId: 507032,
      title: 'Lofi Zelda Quest Bells - 120bpm - Gmin.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '507032__nnaudio__lofi-zelda-quest-bells-120bpm-gmin.wav',
    },
  },
  {
    file: 'music-lofi-bells-140.mp3',
    loops: 9,
    gainDb: -2.7,
    source: {
      freesoundId: 518189,
      title: 'Lofi Bells - 140bpm - Amin.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518189__nnaudio__lofi-bells-140bpm-amin.wav',
    },
  },
  {
    file: 'music-uber-smooth-chords.mp3',
    loops: 10,
    gainDb: 1.6,
    source: {
      freesoundId: 518203,
      title: 'Uber Smooth Chords - 153bpm - Dmin',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518203__nnaudio__uber-smooth-chords-153bpm-dmin.wav',
    },
  },
  {
    file: 'music-lofi-bells-145.mp3',
    loops: 9,
    gainDb: -2.5,
    source: {
      freesoundId: 518194,
      title: 'Lofi Bells - 145bpm - C#min.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518194__nnaudio__lofi-bells-145bpm-cmin.wav',
    },
  },
];

/** The Freesound page for a source. */
export function soundSourceUrl(source: SoundSource): string {
  return `https://freesound.org/s/${source.freesoundId}/`;
}

/** The game's URL for a sound effect. `baseUrl` is Vite's BASE_URL, which ends in a slash. */
export function soundUrl(event: SoundEvent, baseUrl: string): string {
  return `${baseUrl}audio/sfx/${SOUND_CATALOG[event].file}`;
}

/** The game's URL for a music track. `baseUrl` is Vite's BASE_URL, which ends in a slash. */
export function musicUrl(track: MusicTrack, baseUrl: string): string {
  return `${baseUrl}audio/music/${track.file}`;
}

/**
 * One credit line per distinct source, effects first and then music, in catalog order: title,
 * creator, licence and link.
 */
export function soundCreditLines(): string[] {
  const sources = [
    ...SOUND_EVENTS.map((event) => SOUND_CATALOG[event].source),
    ...MUSIC_TRACKS.map((track) => track.source),
  ];
  const seen = new Set<number>();
  const lines: string[] = [];
  for (const source of sources) {
    if (seen.has(source.freesoundId)) continue;
    seen.add(source.freesoundId);
    lines.push(
      `${source.title} by ${source.creator}, ${source.license}. ${soundSourceUrl(source)}`,
    );
  }
  return lines;
}
