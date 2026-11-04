import { describe, expect, it } from 'vitest';
import { soundForSimEvent } from './sim-sounds.ts';

describe('soundForSimEvent', () => {
  it('maps each sim event to its sound', () => {
    expect(soundForSimEvent({ kind: 'building-spawned', building: 3 })).toBe(
      'building.spawn',
    );
    expect(soundForSimEvent({ kind: 'game-over', destination: 1 })).toBe(
      'game.over',
    );
    expect(soundForSimEvent({ kind: 'pin-appeared', destination: 1 })).toBe(
      'pin.appeared',
    );
    expect(soundForSimEvent({ kind: 'car-arrived', destination: 1 })).toBe(
      'car.arrived',
    );
    expect(soundForSimEvent({ kind: 'overflow-started', destination: 1 })).toBe(
      'overflow.started',
    );
    expect(
      soundForSimEvent({
        kind: 'overflow-countdown',
        destination: 1,
        ticksLeft: 30,
      }),
    ).toBe('overflow.countdown');
    expect(soundForSimEvent({ kind: 'week-ended', week: 2 })).toBe(
      'week.ended',
    );
  });
});
