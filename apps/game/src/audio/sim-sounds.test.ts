import { describe, expect, it } from 'vitest';
import { soundForSimEvent } from './sim-sounds.ts';

describe('soundForSimEvent', () => {
  it('plays the building sound when a building spawns', () => {
    expect(soundForSimEvent({ kind: 'building-spawned', building: 3 })).toBe(
      'building.spawn',
    );
  });

  it('plays the game over sound when the game ends', () => {
    expect(soundForSimEvent({ kind: 'game-over', destination: 1 })).toBe(
      'game.over',
    );
  });
});
