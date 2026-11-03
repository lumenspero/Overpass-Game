import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, setVolume } from './settings.ts';

describe('setVolume', () => {
  it('sets one bus and leaves the others', () => {
    const next = setVolume(DEFAULT_SETTINGS, 'music', 3);
    expect(next.musicVolume).toBe(3);
    expect(next.effectsVolume).toBe(DEFAULT_SETTINGS.effectsVolume);
    expect(next.ambienceVolume).toBe(DEFAULT_SETTINGS.ambienceVolume);
    expect(DEFAULT_SETTINGS.musicVolume).toBe(7);
  });

  it('sets the effects and soundscape buses', () => {
    expect(setVolume(DEFAULT_SETTINGS, 'effects', 2).effectsVolume).toBe(2);
    expect(setVolume(DEFAULT_SETTINGS, 'ambience', 0).ambienceVolume).toBe(0);
  });

  it('clamps and rounds the level', () => {
    expect(setVolume(DEFAULT_SETTINGS, 'music', 99).musicVolume).toBe(10);
    expect(setVolume(DEFAULT_SETTINGS, 'music', -4).musicVolume).toBe(0);
    expect(setVolume(DEFAULT_SETTINGS, 'music', 4.6).musicVolume).toBe(5);
  });
});
