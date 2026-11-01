import type { ThemeMode } from '@overpass-game/render-style';

/**
 * Player settings held in memory. The motorway guide and the light or dark mode for now.
 * M10 adds the settings screen, and M11 saves these with the rest of the player's progress.
 */
export interface GameSettings {
  motorwayGuide: boolean;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: GameSettings = {
  motorwayGuide: true,
  theme: 'light',
};

/** Returns a copy with the motorway guide switched on or off. */
export function toggleGuide(settings: GameSettings): GameSettings {
  return { ...settings, motorwayGuide: !settings.motorwayGuide };
}

/** Returns a copy with light and dark mode swapped. */
export function toggleTheme(settings: GameSettings): GameSettings {
  return { ...settings, theme: settings.theme === 'light' ? 'dark' : 'light' };
}
