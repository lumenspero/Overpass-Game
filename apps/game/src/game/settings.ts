import type { ThemeMode } from '@overpass-game/render-style';

/**
 * Player settings: the motorway guide, light or dark mode, and the building symbols for
 * colour-blind players. They are held in memory, so they last for this page load. M11 saves
 * them with the rest of the player's progress.
 */
export interface GameSettings {
  motorwayGuide: boolean;
  theme: ThemeMode;
  /** Draws a shape on each building, one per colour, so colours can be told apart without hue. */
  buildingSymbols: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  motorwayGuide: true,
  theme: 'light',
  buildingSymbols: false,
};

/** Returns a copy with the motorway guide switched on or off. */
export function toggleGuide(settings: GameSettings): GameSettings {
  return { ...settings, motorwayGuide: !settings.motorwayGuide };
}

/** Returns a copy with light and dark mode swapped. */
export function toggleTheme(settings: GameSettings): GameSettings {
  return { ...settings, theme: settings.theme === 'light' ? 'dark' : 'light' };
}

/** Returns a copy with building symbols switched on or off. */
export function toggleSymbols(settings: GameSettings): GameSettings {
  return { ...settings, buildingSymbols: !settings.buildingSymbols };
}

let current: GameSettings = DEFAULT_SETTINGS;

/** The settings the player has chosen this page load. The menu and the game both read them. */
export function currentSettings(): GameSettings {
  return current;
}

/** Keeps the settings for the next screen or game. */
export function saveSettings(settings: GameSettings): void {
  current = settings;
}
