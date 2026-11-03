/**
 * Index rules for the map select carousel. Pure, so the selection rules are tested without a
 * browser. The carousel is a row of cards; one of them is selected and centred.
 */

/** Keeps an index inside a row of `count` cards. An empty row has index 0. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

/** Moves the selection by `delta` cards, stopping at either end. */
export function stepIndex(index: number, delta: number, count: number): number {
  return clampIndex(index + delta, count);
}

/** The card selected when the carousel opens: the first open map, or the first card if none is open. */
export function startIndex(rows: readonly { open: boolean }[]): number {
  const i = rows.findIndex((r) => r.open);
  return i < 0 ? 0 : i;
}
