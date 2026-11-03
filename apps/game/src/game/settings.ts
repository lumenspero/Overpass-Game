import type { SettingsSave } from '@overpass-game/map-schema';
import type { ThemeMode } from '@overpass-game/render-style';
import { savedSettings, setSavedSettings } from './progress.ts';

export type RenderScale = SettingsSave['renderScale'];

/** The render scales the Display tab offers, as percentages of the screen's pixels. */
export const RENDER_SCALES: readonly RenderScale[] = [75, 100, 150];

/**
 * Player settings: the motorway guide, light or dark mode, and the building symbols for
 * colour-blind players. They are saved with the rest of the progress, so they last across visits.
 */
export interface GameSettings {
  motorwayGuide: boolean;
  theme: ThemeMode;
  /** Draws a shape on each building, one per colour, so colours can be told apart without hue. */
  buildingSymbols: boolean;
  /** The canvas resolution as a percentage of the screen's pixels. Applies from the next game. */
  renderScale: RenderScale;
  /** Smooths the edges of drawn shapes. Applies from the next game. */
  antiAliasing: boolean;
  /** Fades the menu screens in and out. */
  menuTransitions: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  motorwayGuide: true,
  theme: 'light',
  buildingSymbols: false,
  renderScale: 100,
  antiAliasing: true,
  menuTransitions: true,
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

/** Returns a copy with the render scale set. */
export function setRenderScale(
  settings: GameSettings,
  renderScale: RenderScale,
): GameSettings {
  return { ...settings, renderScale };
}

/** Returns a copy with anti-aliasing switched on or off. */
export function toggleAntiAliasing(settings: GameSettings): GameSettings {
  return { ...settings, antiAliasing: !settings.antiAliasing };
}

/** Returns a copy with menu transitions switched on or off. */
export function toggleMenuTransitions(settings: GameSettings): GameSettings {
  return { ...settings, menuTransitions: !settings.menuTransitions };
}

/** The settings the player has chosen, or the defaults if they have never changed any. */
export function currentSettings(): GameSettings {
  return savedSettings() ?? DEFAULT_SETTINGS;
}

/** Keeps the settings for the next screen or game, and saves them. */
export function saveSettings(settings: GameSettings): void {
  setSavedSettings(settings);
}
