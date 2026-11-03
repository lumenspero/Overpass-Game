import type { SettingsSave } from '@overpass-game/map-schema';
import type { ThemeMode } from '@overpass-game/render-style';
import { MAX_LEVEL } from '../audio/levels.ts';
import { savedSettings, setSavedSettings } from './progress.ts';

export type ZoomLevel = SettingsSave['zoomLevel'];

/** The zoom levels the Game tab offers, as multiples of the fit-to-screen zoom. */
export const ZOOM_LEVELS: readonly ZoomLevel[] = [1, 1.5, 2];

/**
 * Player settings: the motorway guide, light or dark mode, and the building symbols for
 * colour-blind players. They are saved with the rest of the progress, so they last across visits.
 */
export interface GameSettings {
  motorwayGuide: boolean;
  theme: ThemeMode;
  /** Draws a shape on each building, one per colour, so colours can be told apart without hue. */
  buildingSymbols: boolean;
  /** Smooths the edges of drawn shapes. Applies from the next game. */
  antiAliasing: boolean;
  /** Fades the menu screens in and out. */
  menuTransitions: boolean;
  /** 'waypoints' lays road between clicks; 'drag' draws as the pointer moves. */
  drawMode: SettingsSave['drawMode'];
  /** On: a touch held still erases. Off: it places a tile. */
  holdToErase: boolean;
  /** After a touch stroke, the camera zooms so the whole stroke is in view. */
  touchAutoZoom: boolean;
  /** The zoom each game opens at, as a multiple of fit-to-screen. */
  zoomLevel: ZoomLevel;
  /** Volume of the music bus, 0 (silent) to 10. */
  musicVolume: number;
  /** Volume of the effects bus, 0 to 10. */
  effectsVolume: number;
  /** Volume of the soundscape bus, 0 to 10. */
  ambienceVolume: number;
}

export type AudioBus = 'music' | 'effects' | 'ambience';

const VOLUME_FIELD = {
  music: 'musicVolume',
  effects: 'effectsVolume',
  ambience: 'ambienceVolume',
} as const;

export const DEFAULT_SETTINGS: GameSettings = {
  motorwayGuide: true,
  theme: 'light',
  buildingSymbols: false,
  antiAliasing: true,
  menuTransitions: true,
  drawMode: 'drag',
  holdToErase: true,
  touchAutoZoom: false,
  zoomLevel: 1,
  musicVolume: 7,
  effectsVolume: 8,
  ambienceVolume: 5,
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

/** Returns a copy with click-to-draw waypoints switched on or off. */
export function toggleDrawMode(settings: GameSettings): GameSettings {
  return {
    ...settings,
    drawMode: settings.drawMode === 'waypoints' ? 'drag' : 'waypoints',
  };
}

/** Returns a copy with hold-to-erase switched on or off. */
export function toggleHoldToErase(settings: GameSettings): GameSettings {
  return { ...settings, holdToErase: !settings.holdToErase };
}

/** Returns a copy with touch auto-zoom switched on or off. */
export function toggleTouchAutoZoom(settings: GameSettings): GameSettings {
  return { ...settings, touchAutoZoom: !settings.touchAutoZoom };
}

/** Returns a copy with the zoom level set. */
export function setZoomLevel(
  settings: GameSettings,
  zoomLevel: ZoomLevel,
): GameSettings {
  return { ...settings, zoomLevel };
}

/** Returns a copy with one volume bus set, clamped to the range 0 to 10. */
export function setVolume(
  settings: GameSettings,
  bus: AudioBus,
  level: number,
): GameSettings {
  const clamped = Math.min(MAX_LEVEL, Math.max(0, Math.round(level)));
  return { ...settings, [VOLUME_FIELD[bus]]: clamped };
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
