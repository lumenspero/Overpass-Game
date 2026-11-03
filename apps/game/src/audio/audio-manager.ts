import {
  musicUrl,
  soundUrl,
  type MusicTrack,
  type SoundEvent,
} from './catalog.ts';
import { volumeToGain } from './levels.ts';

/** The volume level of each bus, from 0 to 10. */
export interface AudioLevels {
  music: number;
  effects: number;
  ambience: number;
}

type BusName = keyof AudioLevels;

/**
 * Plays sound effects and music through three gain buses (music, effects and soundscape), each set
 * from the player's levels. The menu runs before any Phaser game exists, so this uses the Web Audio
 * API directly rather than a Phaser sound manager.
 *
 * Browsers keep audio suspended until the page gets a tap or key press. `unlock` runs from such a
 * gesture: it resumes audio, and starts any music that was waiting for it.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private buses: Record<BusName, GainNode> | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private levels: AudioLevels;
  private wanted: MusicTrack | null = null;
  private playing: { track: MusicTrack; source: AudioBufferSourceNode } | null =
    null;
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

  /** Plays a sound effect once. It is silent until audio is unlocked. */
  playEffect(event: SoundEvent): void {
    const context = this.ensureContext();
    if (!context || context.state !== 'running' || !this.buses) return;
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
    this.playing?.source.stop();
    this.playing = null;
  }

  private startWanted(): void {
    const track = this.wanted;
    const context = this.context;
    if (!track || !context || context.state !== 'running' || !this.buses)
      return;
    if (this.playing?.track === track) return;
    const music = this.buses.music;
    void this.load(musicUrl(track, this.baseUrl)).then((buffer) => {
      // The wanted track may have changed, or been stopped, while it loaded.
      if (!buffer || this.wanted !== track || this.playing?.track === track) {
        return;
      }
      this.playing?.source.stop();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(music);
      source.start();
      this.playing = { track, source };
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
