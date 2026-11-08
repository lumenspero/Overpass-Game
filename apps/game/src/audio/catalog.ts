/**
 * Game audio, mapped from game events and music tracks to the game's file names and their sources.
 * Every sound effect is a generated tone; the music comes from Freesound.
 *
 * A source is either a Freesound file or a tone made by `tools/audio/generate-tones.py`. Freesound
 * entries keep the id, title, creator, licence and the original file's name, and the
 * credits are built from them, so a file can be renamed here without losing its attribution.
 * Generated tones are our own work and need no credit.
 */

export const SOUND_EVENTS = [
  'menu.level-select',
  'menu.enter',
  'menu.back',
  'map.next',
  'map.previous',
  'clock.select',
  'clock.tick',
  'clock.tock',
  'building.spawn',
  'game.over',
  'pin.appeared',
  'car.arrived',
  'overflow.started',
  'overflow.countdown',
  'week.ended',
  'road.place',
  'road.erase',
  'place.refused',
  'upgrade.pick',
  'control.place',
  'motorway.place',
  'crossing.place',
  'toggle.on',
  'toggle.off',
  'options.tab',
  'motorway.erase',
  'fence.grew',
  'new.best',
  'map.unlocked',
  'save.done',
  'notice.error',
] as const;

export type SoundEvent = (typeof SOUND_EVENTS)[number];

export type SoundLicense = 'CC0' | 'CC BY 3.0' | 'CC BY 4.0';

/** A sound from Freesound. The credits are built from these fields. */
export interface FreesoundSource {
  readonly kind: 'freesound';
  /** Freesound sound id; the page is https://freesound.org/s/<id>/. */
  readonly freesoundId: number;
  /** Title as shown on Freesound. */
  readonly title: string;
  readonly creator: string;
  readonly license: SoundLicense;
  /** The original file's name on Freesound. Not kept in the repo: download it to docs/sounds/ to remake the stems. */
  readonly archive: string;
}

/** A tone made by tools/audio/generate-tones.py. `name` is its key in that script's SOUNDS. */
export interface GeneratedSource {
  readonly kind: 'generated';
  readonly name: string;
}

export type SoundSource = FreesoundSource | GeneratedSource;

export interface SoundEntry {
  /** File name under audio/sfx/ in the game's public folder. */
  readonly file: string;
  readonly source: SoundSource;
}

export const SOUND_CATALOG: Readonly<Record<SoundEvent, SoundEntry>> = {
  'menu.level-select': {
    file: 'level-select.wav',
    source: { kind: 'generated', name: 'level-select' },
  },
  'menu.enter': {
    file: 'menu-enter.wav',
    source: { kind: 'generated', name: 'menu-enter' },
  },
  'menu.back': {
    file: 'menu-back.wav',
    source: { kind: 'generated', name: 'menu-back' },
  },
  'map.next': {
    file: 'map-next.wav',
    source: { kind: 'generated', name: 'map-next' },
  },
  'map.previous': {
    file: 'map-previous.wav',
    source: { kind: 'generated', name: 'map-previous' },
  },
  'clock.select': {
    file: 'clock-select.wav',
    source: { kind: 'generated', name: 'clock-select' },
  },
  'clock.tick': {
    file: 'clock-tick.wav',
    source: { kind: 'generated', name: 'clock-tick' },
  },
  'clock.tock': {
    file: 'clock-tock.wav',
    source: { kind: 'generated', name: 'clock-tock' },
  },
  'building.spawn': {
    file: 'building-spawn.wav',
    source: { kind: 'generated', name: 'building-spawn' },
  },
  'game.over': {
    file: 'game-over.wav',
    source: { kind: 'generated', name: 'game-over' },
  },
  'pin.appeared': {
    file: 'pin-appeared.wav',
    source: { kind: 'generated', name: 'pin-appeared' },
  },
  'car.arrived': {
    file: 'car-arrived.wav',
    source: { kind: 'generated', name: 'car-arrived' },
  },
  'overflow.started': {
    file: 'overflow-started.wav',
    source: { kind: 'generated', name: 'overflow-started' },
  },
  'overflow.countdown': {
    file: 'overflow-countdown.wav',
    source: { kind: 'generated', name: 'overflow-countdown' },
  },
  'week.ended': {
    file: 'week-ended.wav',
    source: { kind: 'generated', name: 'week-ended' },
  },
  'road.place': {
    file: 'road-place.wav',
    source: { kind: 'generated', name: 'road-place' },
  },
  'road.erase': {
    file: 'road-erase.wav',
    source: { kind: 'generated', name: 'road-erase' },
  },
  'place.refused': {
    file: 'place-refused.wav',
    source: { kind: 'generated', name: 'place-refused' },
  },
  'upgrade.pick': {
    file: 'upgrade-pick.wav',
    source: { kind: 'generated', name: 'upgrade-pick' },
  },
  'control.place': {
    file: 'control-place.wav',
    source: { kind: 'generated', name: 'control-place' },
  },
  'motorway.place': {
    file: 'motorway-place.wav',
    source: { kind: 'generated', name: 'motorway-place' },
  },
  'crossing.place': {
    file: 'crossing-place.wav',
    source: { kind: 'generated', name: 'crossing-place' },
  },
  'toggle.on': {
    file: 'toggle-on.wav',
    source: { kind: 'generated', name: 'toggle-on' },
  },
  'toggle.off': {
    file: 'toggle-off.wav',
    source: { kind: 'generated', name: 'toggle-off' },
  },
  'options.tab': {
    file: 'options-tab.wav',
    source: { kind: 'generated', name: 'options-tab' },
  },
  'motorway.erase': {
    file: 'motorway-erase.wav',
    source: { kind: 'generated', name: 'motorway-erase' },
  },
  'fence.grew': {
    file: 'district-opened.wav',
    source: { kind: 'generated', name: 'district-opened' },
  },
  'new.best': {
    file: 'new-best.wav',
    source: { kind: 'generated', name: 'new-best' },
  },
  'map.unlocked': {
    file: 'map-unlocked.wav',
    source: { kind: 'generated', name: 'map-unlocked' },
  },
  'save.done': {
    file: 'save-done.wav',
    source: { kind: 'generated', name: 'save-done' },
  },
  'notice.error': {
    file: 'notice-error.wav',
    source: { kind: 'generated', name: 'notice-error' },
  },
};

/**
 * The three stems every music track is split into. They play together, in step, and each one's
 * volume follows the game (see music-stems.ts). Each stem is an MP3 named after it.
 */
export const MUSIC_STEMS = ['pad', 'melody', 'percussion'] as const;
export type MusicStem = (typeof MUSIC_STEMS)[number];

/**
 * Background music. Each track is looped to about two minutes, then set to the shared level of
 * -21 LUFS. `gainDb` is the change from the measured level, and `loops` is the number of copies
 * joined with a 50 ms crossfade. Each track's stems live in its folder under audio/music/.
 */
export interface MusicTrack {
  /** The folder under audio/music/ holding the track's stems, one MP3 per entry of MUSIC_STEMS. */
  readonly folder: string;
  readonly loops: number;
  readonly gainDb: number;
  readonly source: FreesoundSource;
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    folder: 'stems/synth-pad-chords',
    loops: 9,
    gainDb: -1.3,
    source: {
      kind: 'freesound',
      freesoundId: 518198,
      title: 'Synth Pad Chords - 130bpm - C#min.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518198__nnaudio__synth-pad-chords-130bpm-cmin.wav',
    },
  },
  {
    folder: 'stems/vibey-synth',
    loops: 9,
    gainDb: -1.1,
    source: {
      kind: 'freesound',
      freesoundId: 518644,
      title: 'Vibey Synth 10 - 133bpm - Emin.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518644__nnaudio__vibey-synth-10-133bpm-emin.wav',
    },
  },
  {
    folder: 'stems/summer-love-keys',
    loops: 10,
    gainDb: -0.7,
    source: {
      kind: 'freesound',
      freesoundId: 583356,
      title: 'Summer Love Tyler "Flower" Synth Keys - 80bpm - C',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive:
        '583356__nnaudio__summer-love-tyler-flower-synth-keys-80bpm-c.wav',
    },
  },
  {
    folder: 'stems/lofi-zelda-bells',
    loops: 8,
    gainDb: -1.2,
    source: {
      kind: 'freesound',
      freesoundId: 507032,
      title: 'Lofi Zelda Quest Bells - 120bpm - Gmin.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '507032__nnaudio__lofi-zelda-quest-bells-120bpm-gmin.wav',
    },
  },
  {
    folder: 'stems/lofi-bells-140',
    loops: 9,
    gainDb: -2.7,
    source: {
      kind: 'freesound',
      freesoundId: 518189,
      title: 'Lofi Bells - 140bpm - Amin.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518189__nnaudio__lofi-bells-140bpm-amin.wav',
    },
  },
  {
    folder: 'stems/uber-smooth-chords',
    loops: 10,
    gainDb: 1.6,
    source: {
      kind: 'freesound',
      freesoundId: 518203,
      title: 'Uber Smooth Chords - 153bpm - Dmin',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518203__nnaudio__uber-smooth-chords-153bpm-dmin.wav',
    },
  },
  {
    folder: 'stems/lofi-bells-145',
    loops: 9,
    gainDb: -2.5,
    source: {
      kind: 'freesound',
      freesoundId: 518194,
      title: 'Lofi Bells - 145bpm - C#min.wav',
      creator: 'nnaudio',
      license: 'CC BY 4.0',
      archive: '518194__nnaudio__lofi-bells-145bpm-cmin.wav',
    },
  },
];

/** The Freesound page for a source. */
export function soundSourceUrl(source: FreesoundSource): string {
  return `https://freesound.org/s/${source.freesoundId}/`;
}

/** The game's URL for a sound effect. `baseUrl` is Vite's BASE_URL, which ends in a slash. */
export function soundUrl(event: SoundEvent, baseUrl: string): string {
  return `${baseUrl}audio/sfx/${SOUND_CATALOG[event].file}`;
}

/**
 * The game's URL for one stem of a music track. `baseUrl` is Vite's BASE_URL, which ends in a
 * slash.
 */
export function musicStemUrl(
  track: MusicTrack,
  stem: MusicStem,
  baseUrl: string,
): string {
  return `${baseUrl}audio/music/${track.folder}/${stem}.mp3`;
}

/**
 * One credit line per distinct Freesound source, effects first and then music, in catalog order:
 * title, creator, licence and link. Generated tones are our own and are not listed.
 */
export function soundCreditLines(): string[] {
  const sources: SoundSource[] = [
    ...SOUND_EVENTS.map((event) => SOUND_CATALOG[event].source),
    ...MUSIC_TRACKS.map((track) => track.source),
  ];
  const seen = new Set<number>();
  const lines: string[] = [];
  for (const source of sources) {
    if (source.kind !== 'freesound' || seen.has(source.freesoundId)) continue;
    seen.add(source.freesoundId);
    lines.push(
      `${source.title} by ${source.creator}, ${source.license}. ${soundSourceUrl(source)}`,
    );
  }
  // CC BY asks for changes to be said, so the music credit notes that it was changed.
  if (MUSIC_TRACKS.length > 0) lines.push(MUSIC_CREDIT_NOTE);
  return lines;
}

/** Said after the music credits: the tracks are changed, as CC BY requires saying. */
export const MUSIC_CREDIT_NOTE =
  'The music is looped and split into stems from the recordings above.';
