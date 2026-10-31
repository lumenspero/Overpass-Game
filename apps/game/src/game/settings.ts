/**
 * Player settings held in memory. Only the motorway guide for now: M10 adds the settings
 * screen, and M11 saves these with the rest of the player's progress.
 */
export interface GameSettings {
  motorwayGuide: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = { motorwayGuide: true };

/** Returns a copy with the motorway guide switched on or off. */
export function toggleGuide(settings: GameSettings): GameSettings {
  return { ...settings, motorwayGuide: !settings.motorwayGuide };
}
