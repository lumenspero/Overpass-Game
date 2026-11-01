/** Undo and redo over immutable states. Each edit commits a new state; nothing is mutated. */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Records a new state and clears the redo stack. A state equal to the present one (same
 * reference) is not recorded, so a no-op edit leaves no undo step behind.
 */
export function commit<T>(h: History<T>, next: T, limit: number): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  const kept = past.length > limit ? past.slice(past.length - limit) : past;
  return { past: kept, present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1] as T;
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future as [T, ...T[]];
  return { past: [...h.past, h.present], present: next, future: rest };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}
