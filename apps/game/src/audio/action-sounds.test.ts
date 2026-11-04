import { describe, expect, it } from 'vitest';
import { actionSounds, EMPTY_TALLY, placementReport } from './action-sounds.ts';

const tally = (
  placed: number,
  erased = 0,
  halted = false,
  motorwaysErased = 0,
) => ({
  placed,
  erased,
  halted,
  motorwaysErased,
});

describe('actionSounds', () => {
  it('taps once when an input lays tiles, however many', () => {
    expect(actionSounds(tally(2), tally(5), null, null)).toEqual([
      'road.place',
    ]);
  });

  it('plays the erase tap when tiles are removed', () => {
    expect(actionSounds(tally(0, 1), tally(0, 3), null, null)).toEqual([
      'road.erase',
    ]);
  });

  it('is silent when nothing changed', () => {
    expect(actionSounds(tally(3), tally(3), null, null)).toEqual([]);
  });

  it('thuds once when a tile first refuses the stroke', () => {
    expect(actionSounds(tally(1), tally(1, 0, true), null, null)).toEqual([
      'place.refused',
    ]);
    expect(
      actionSounds(tally(1, 0, true), tally(1, 0, true), null, null),
    ).toEqual([]);
  });

  it('plays the placement sound for a new successful report', () => {
    const before = { seq: 1, kind: 'bridge', ok: true };
    expect(
      actionSounds(EMPTY_TALLY, EMPTY_TALLY, before, {
        seq: 2,
        kind: 'motorway',
        ok: true,
      }),
    ).toEqual(['motorway.place']);
    expect(
      actionSounds(EMPTY_TALLY, EMPTY_TALLY, before, {
        seq: 2,
        kind: 'control',
        ok: true,
      }),
    ).toEqual(['control.place']);
    expect(
      actionSounds(EMPTY_TALLY, EMPTY_TALLY, null, {
        seq: 1,
        kind: 'tunnel',
        ok: true,
      }),
    ).toEqual(['crossing.place']);
  });

  it('thuds for a new failed report, and ignores a report it has already seen', () => {
    const failed = { seq: 3, kind: 'bridge', ok: false };
    expect(actionSounds(EMPTY_TALLY, EMPTY_TALLY, null, failed)).toEqual([
      'place.refused',
    ]);
    expect(actionSounds(EMPTY_TALLY, EMPTY_TALLY, failed, failed)).toEqual([]);
  });

  it('reads the controller report', () => {
    expect(placementReport(null)).toBeNull();
    expect(
      placementReport({ seq: 4, kind: 'control', result: { ok: false } }),
    ).toEqual({
      seq: 4,
      kind: 'control',
      ok: false,
    });
  });

  it('plays the motorway erase sound when an erase stroke removes a motorway', () => {
    expect(actionSounds(tally(0), tally(0, 0, false, 1), null, null)).toEqual([
      'motorway.erase',
    ]);
  });
});
