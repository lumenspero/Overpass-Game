/** Tile coordinate in grid space. */
export interface TileXY {
  x: number;
  y: number;
}

/**
 * Appends the 4-connected tiles leading from the last tile in `path` to `next`.
 * Fast drags skip tiles between pointer samples; this fills the gap so roads
 * stay connected by shared edges (the sim's adjacency rule). Diagonal steps are
 * split into one horizontal and one vertical move, taking the larger axis first.
 * Returns the tiles that were added (possibly none).
 */
export function extendPath(path: TileXY[], next: TileXY): TileXY[] {
  const added: TileXY[] = [];
  const last = path[path.length - 1];
  if (!last) {
    path.push({ ...next });
    added.push({ ...next });
    return added;
  }
  let { x, y } = last;
  const dx = next.x - x;
  const dy = next.y - y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  // Walk the straight line between the two tiles, emitting an extra
  // orthogonal tile whenever both axes advance in the same step.
  for (let i = 1; i <= steps; i++) {
    const tx = last.x + Math.round((dx * i) / steps);
    const ty = last.y + Math.round((dy * i) / steps);
    if (tx !== x && ty !== y) {
      const corner = Math.abs(dx) >= Math.abs(dy) ? { x: tx, y } : { x, y: ty };
      path.push(corner);
      added.push(corner);
    }
    if (tx !== x || ty !== y) {
      x = tx;
      y = ty;
      path.push({ x, y });
      added.push({ x, y });
    }
  }
  return added;
}
