import type { SimState } from '@overpass-game/sim';

/**
 * Hands a saved run from the menu to the next game, and lets the menu ask the running game to save
 * before it leaves. The scene reads and clears the pending run when it is created, so a restart
 * always begins a fresh game.
 */

let pending: SimState | null = null;
let saver: (() => void) | null = null;

/** Sets the run the next game starts from, or null to start a new run. */
export function setPendingResume(sim: SimState | null): void {
  pending = sim;
}

/** Takes the pending run and clears it, so it is used once. */
export function takePendingResume(): SimState | null {
  const sim = pending;
  pending = null;
  return sim;
}

/** Registered by the running game, so it can be asked to save. */
export function setRunSaver(save: (() => void) | null): void {
  saver = save;
}

/** Saves the running game, if there is one, before it is stopped. */
export function saveActiveRun(): void {
  saver?.();
}
