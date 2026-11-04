/**
 * Things the sim did during a tick that the rest of the game can react to, such as playing a sound.
 * `step` returns the events from its tick. They are not saved, so they cost nothing in the save file.
 */
export type SimEvent =
  | { kind: 'building-spawned'; building: number }
  | { kind: 'game-over'; destination: number }
  | { kind: 'pin-appeared'; destination: number }
  | { kind: 'car-arrived'; destination: number }
  | { kind: 'overflow-started'; destination: number }
  | { kind: 'overflow-countdown'; destination: number; ticksLeft: number }
  | { kind: 'week-ended'; week: number };

let pending: SimEvent[] = [];

/** Records an event for the tick in progress. */
export function emitEvent(event: SimEvent): void {
  pending.push(event);
}

/** Returns the events recorded since the last call, and clears them. */
export function takeEvents(): SimEvent[] {
  const events = pending;
  pending = [];
  return events;
}
