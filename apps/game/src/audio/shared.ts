import { AudioManager } from './audio-manager.ts';

/**
 * The one audio manager for the page. The menu and the game both play through it, and its levels
 * are set from the saved settings at boot.
 */
export const audio = new AudioManager(import.meta.env.BASE_URL, {
  music: 7,
  effects: 8,
  ambience: 5,
});
