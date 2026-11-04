import {
  MUSIC_STEMS,
  musicStemUrl,
  soundUrl,
  type MusicStem,
  type MusicTrack,
  type SoundEvent,
} from './catalog.ts';
import { volumeToGain } from './levels.ts';
import { FULL_STEMS, STEM_FADE_S, type StemLevels } from './music-stems.ts';
import { allowPlay, MIN_GAP_S } from './throttle.ts';

/** The volume level of each bus, from 0 to 10. */
export interface AudioLevels {
  music: number;
  effects: number;
  ambience: number;
}

type BusName = keyof AudioLevels;

interface PlayingTrack {
  track: MusicTrack;
  sources: AudioBufferSourceNode[];
  gains: Record<MusicStem, GainNode>;
}

/**
 * Plays sound effects and music through three gain buses (music, effects and soundscape), each set
 * from the player's levels. The menu runs before any Phaser game exists, so this uses the Web Audio
 * API directly rather than a Phaser sound manager.
 *
 * A music track is three stems that start together and loop in step. Each stem has its own gain,
 * which `setStems` moves to follow the game.
 *
 * Browsers keep audio suspended until the page gets a tap or key press. `unlock` runs from such a
 * gesture: it resumes audio, and starts any music that was waiting for it.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private buses: Record<BusName, GainNode> | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private levels: AudioLevels;
  /** When each effect last played, in audio-clock seconds, for throttling. */
  private readonly lastPlayed = new Map<SoundEvent, number>();
  private wanted: MusicTrack | null = null;
  private playing: PlayingTrack | null = null;
  /** The stem levels the music is moving towards. */
  private stems: StemLevels = FULL_STEMS;
  private readonly baseUrl: string;

  constructor(baseUrl: string, levels: AudioLevels) {
    this.baseUrl = baseUrl;
    this.levels = levels;
  }

  /** Call from a tap or key press. Resumes audio and starts any waiting music. */
  unlock(): void {
    const context = this.ensureContext();
    if (!context) return;
    if (context.state === 'suspended') {
      void context.resume().then(() => this.startWanted());
    } else {
      this.startWanted();
    }
  }

  /** Applies new volume levels to the buses, from the next sound on. */
  setLevels(levels: AudioLevels): void {
    this.levels = levels;
    if (!this.buses) return;
    for (const bus of ['music', 'effects', 'ambience'] as const) {
      this.buses[bus].gain.value = volumeToGain(levels[bus]);
    }
  }

  /**
   * Moves each stem of the playing music towards its level, over about STEM_FADE_S seconds. Safe
   * to call every frame: a level already reached does not change anything.
   */
  setStems(stems: StemLevels): void {
    if (MUSIC_STEMS.every((stem) => stems[stem] === this.stems[stem])) return;
    this.stems = stems;
    const playing = this.playing;
    const context = this.context;
    if (!playing || !context) return;
    const now = context.currentTime;
    for (const stem of MUSIC_STEMS) {
      playing.gains[stem].gain.setTargetAtTime(stems[stem], now, STEM_FADE_S);
    }
  }

  /** Plays a sound effect once. It is silent until audio is unlocked. */
  playEffect(event: SoundEvent): void {
    const context = this.ensureContext();
    if (!context || context.state !== 'running' || !this.buses) return;
    const now = context.currentTime;
    if (!allowPlay(this.lastPlayed.get(event), now, MIN_GAP_S[event])) return;
    this.lastPlayed.set(event, now);
    const effects = this.buses.effects;
    void this.load(soundUrl(event, this.baseUrl)).then((buffer) => {
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(effects);
      source.start();
    });
  }

  /** Starts a music track looping. A track already playing carries on. */
  playMusic(track: MusicTrack): void {
    this.wanted = track;
    this.startWanted();
  }

  /** Stops the music. */
  stopMusic(): void {
    this.wanted = null;
    this.stopPlaying();
  }

  private stopPlaying(): void {
    for (const source of this.playing?.sources ?? []) source.stop();
    this.playing = null;
  }

  private startWanted(): void {
    const track = this.wanted;
    const context = this.context;
    if (!track || !context || context.state !== 'running' || !this.buses)
      return;
    if (this.playing?.track === track) return;
    const music = this.buses.music;
    const loads = MUSIC_STEMS.map((stem) =>
      this.load(musicStemUrl(track, stem, this.baseUrl)),
    );
    void Promise.all(loads).then((buffers) => {
      const loaded = buffers.filter((b): b is AudioBuffer => b !== null);
      // The wanted track may have changed, or been stopped, while it loaded.
      if (
        loaded.length !== MUSIC_STEMS.length ||
        this.wanted !== track ||
        this.playing?.track === track
      ) {
        return;
      }
      this.stopPlaying();
      // All stems start at one moment, so they stay in step as they loop.
      const start = context.currentTime + 0.05;
      const sources: AudioBufferSourceNode[] = [];
      const gains = {} as Record<MusicStem, GainNode>;
      MUSIC_STEMS.forEach((stem, i) => {
        const gain = context.createGain();
        gain.gain.value = this.stems[stem];
        gain.connect(music);
        const source = context.createBufferSource();
        source.buffer = loaded[i];
        source.loop = true;
        source.connect(gain);
        source.start(start);
        sources.push(source);
        gains[stem] = gain;
      });
      this.playing = { track, sources, gains };
    });
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof AudioContext === 'undefined') return null;
    const context = new AudioContext();
    const buses = {
      music: context.createGain(),
      effects: context.createGain(),
      ambience: context.createGain(),
    };
    for (const bus of Object.keys(buses) as BusName[]) {
      buses[bus].gain.value = volumeToGain(this.levels[bus]);
      buses[bus].connect(context.destination);
    }
    this.context = context;
    this.buses = buses;
    return context;
  }

  private load(url: string): Promise<AudioBuffer | null> {
    let cached = this.buffers.get(url);
    if (!cached) {
      cached = this.fetchBuffer(url);
      this.buffers.set(url, cached);
    }
    return cached;
  }

  private async fetchBuffer(url: string): Promise<AudioBuffer | null> {
    const context = this.context;
    if (!context) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} for ${url}`);
      return await context.decodeAudioData(await response.arrayBuffer());
    } catch (err) {
      console.warn('Audio did not load', err);
      return null;
    }
  }
}
