import { afterEach, describe, expect, it } from 'vitest';
import {
  currentSettings,
  DEFAULT_SETTINGS,
  saveSettings,
  toggleGuide,
  toggleSymbols,
  toggleTheme,
} from './settings.ts';

afterEach(() => saveSettings(DEFAULT_SETTINGS));

describe('settings', () => {
  it('starts with the motorway guide on', () => {
    expect(DEFAULT_SETTINGS.motorwayGuide).toBe(true);
  });

  it('toggles the guide without changing the original', () => {
    const off = toggleGuide(DEFAULT_SETTINGS);
    expect(off.motorwayGuide).toBe(false);
    expect(DEFAULT_SETTINGS.motorwayGuide).toBe(true);
    expect(toggleGuide(off).motorwayGuide).toBe(true);
  });

  it('starts in light mode', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('light');
  });

  it('swaps light and dark without changing the original', () => {
    const dark = toggleTheme(DEFAULT_SETTINGS);
    expect(dark.theme).toBe('dark');
    expect(DEFAULT_SETTINGS.theme).toBe('light');
    expect(toggleTheme(dark).theme).toBe('light');
  });

  it('starts with building symbols off, and toggles them', () => {
    expect(DEFAULT_SETTINGS.buildingSymbols).toBe(false);
    const on = toggleSymbols(DEFAULT_SETTINGS);
    expect(on.buildingSymbols).toBe(true);
    expect(DEFAULT_SETTINGS.buildingSymbols).toBe(false);
    expect(toggleSymbols(on).buildingSymbols).toBe(false);
  });

  it('keeps the chosen settings for the next screen', () => {
    expect(currentSettings()).toEqual(DEFAULT_SETTINGS);
    const chosen = toggleSymbols(toggleTheme(DEFAULT_SETTINGS));
    saveSettings(chosen);
    expect(currentSettings()).toEqual(chosen);
  });
});
