/** Tile coordinate in grid space. */
export interface TileXY {
  x: number;
  y: number;
}

/**
 * Appends the tiles leading from the last tile in `path` to `next`, so that each
 * tile touches the one before it by an edge or a corner (the sim's adjacency rule).
 * Fast drags skip tiles between pointer samples; this fills the gap along the
 * straight line between the two tiles. A diagonal drag stays diagonal.
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
  const dx = next.x - last.x;
  const dy = next.y - last.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  // Each step moves by at most one tile on each axis, so consecutive tiles always touch.
  for (let i = 1; i <= steps; i++) {
    const tile = {
      x: last.x + Math.round((dx * i) / steps),
      y: last.y + Math.round((dy * i) / steps),
    };
    path.push(tile);
    added.push(tile);
  }
  return added;
}
