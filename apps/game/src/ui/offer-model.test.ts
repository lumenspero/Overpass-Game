import { OFFER_OPTIONS } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import {
  choiceName,
  tilesText,
  upgradeCount,
  waitingText,
  weekNumber,
} from './offer-model.ts';

describe('weekNumber', () => {
  it('names the week that has just ended', () => {
    expect(weekNumber(2700, 2700)).toBe(1);
    expect(weekNumber(8100, 2700)).toBe(3);
  });

  it('never goes below week 1', () => {
    expect(weekNumber(0, 2700)).toBe(1);
  });
});

describe('upgradeCount and choiceName', () => {
  it('counts two traffic lights as two items', () => {
    expect(upgradeCount(OFFER_OPTIONS.lights)).toBe(2);
    expect(choiceName('lights', 'Traffic lights')).toBe('2 Traffic lights');
  });

  it('gives a single upgrade its plain name', () => {
    expect(upgradeCount(OFFER_OPTIONS.bridge)).toBe(1);
    expect(choiceName('bridge', 'Bridge')).toBe('Bridge');
  });

  it('gives road tiles no count', () => {
    expect(upgradeCount(OFFER_OPTIONS.tiles)).toBe(0);
    expect(choiceName('tiles', 'Road tiles')).toBe('Road tiles');
  });
});

describe('text lines', () => {
  it('shows the tile amount', () => {
    expect(tilesText(20)).toBe('20 road tiles');
  });

  it('shows a waiting line only when offers queue up', () => {
    expect(waitingText(1)).toBe('');
    expect(waitingText(3)).toBe('3 offers waiting');
  });
});
