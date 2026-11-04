import type { SoundEvent } from './catalog.ts';

/** What a stroke has done so far: tiles laid, tiles removed, and whether a tile refused it. */
export interface StrokeTally {
  placed: number;
  erased: number;
  halted: boolean;
  /** Motorways an erase stroke has removed. */
  motorwaysErased: number;
}

/** A placement the controller reported on release: a bridge, tunnel, motorway or control. */
export interface PlacementReport {
  seq: number;
  kind: string;
  ok: boolean;
}

export const EMPTY_TALLY: StrokeTally = {
  placed: 0,
  erased: 0,
  halted: false,
  motorwaysErased: 0,
};

/** The controller's last report as a placement report, or null if there is none. */
export function placementReport(
  report: { seq: number; kind: string; result: { ok: boolean } } | null,
): PlacementReport | null {
  return report === null
    ? null
    : { seq: report.seq, kind: report.kind, ok: report.result.ok };
}

/**
 * The sounds for one input, from the stroke's tally and the last placement report before and after
 * it. A tile laid or removed taps once per input; a refused tile or placement thuds; a new report
 * plays the sound for what was placed.
 */
export function actionSounds(
  before: StrokeTally,
  after: StrokeTally,
  reportBefore: PlacementReport | null,
  reportAfter: PlacementReport | null,
): SoundEvent[] {
  const sounds: SoundEvent[] = [];
  if (after.placed > before.placed) sounds.push('road.place');
  if (after.erased > before.erased) sounds.push('road.erase');
  if (after.motorwaysErased > before.motorwaysErased) {
    sounds.push('motorway.erase');
  }
  let refused = after.halted && !before.halted;
  if (reportAfter && reportAfter.seq !== reportBefore?.seq) {
    if (!reportAfter.ok) refused = true;
    else if (reportAfter.kind === 'motorway') sounds.push('motorway.place');
    else if (reportAfter.kind === 'control') sounds.push('control.place');
    else sounds.push('crossing.place');
  }
  if (refused) sounds.push('place.refused');
  return sounds;
}
