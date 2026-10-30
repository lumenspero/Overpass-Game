import { describe, expect, it } from 'vitest';
import { extendPath, type TileXY } from './path.ts';

/** Each tile touches the one before it by an edge or a corner. */
function isEightConnected(path: { x: number; y: number }[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i].x - path[i - 1].x);
    const dy = Math.abs(path[i].y - path[i - 1].y);
    if (Math.max(dx, dy) !== 1) return false;
  }
  return true;
}

describe('extendPath', () => {
  it('starts an empty path with the first tile', () => {
    const path: TileXY[] = [];
    expect(extendPath(path, { x: 2, y: 3 })).toEqual([{ x: 2, y: 3 }]);
    expect(path).toEqual([{ x: 2, y: 3 }]);
  });

  it('adds nothing when the pointer stays on the same tile', () => {
    const path = [{ x: 1, y: 1 }];
    expect(extendPath(path, { x: 1, y: 1 })).toEqual([]);
  });

  it('fills a straight gap', () => {
    const path = [{ x: 0, y: 0 }];
    extendPath(path, { x: 3, y: 0 });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('keeps a diagonal step as one step', () => {
    const path = [{ x: 0, y: 0 }];
    extendPath(path, { x: 1, y: 1 });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('keeps any jump connected by edges or corners and ending on the target', () => {
    for (const target of [
      { x: 5, y: 2 },
      { x: -4, y: 7 },
      { x: -3, y: -3 },
      { x: 0, y: -6 },
    ]) {
      const path = [{ x: 0, y: 0 }];
      extendPath(path, target);
      expect(isEightConnected(path)).toBe(true);
      expect(path[path.length - 1]).toEqual(target);
      expect(path).toHaveLength(
        Math.max(Math.abs(target.x), Math.abs(target.y)) + 1,
      );
    }
  });
});
