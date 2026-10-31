import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, toggleGuide } from './settings.ts';

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
});
