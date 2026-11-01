import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  undo,
} from './history.ts';

describe('history', () => {
  it('commits, undoes and redoes in order', () => {
    let h = createHistory('a');
    h = commit(h, 'b', 10);
    h = commit(h, 'c', 10);
    expect(h.present).toBe('c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe('b');
    expect(canRedo(h)).toBe(true);
  });

  it('clears the redo stack on a new edit', () => {
    let h = commit(createHistory('a'), 'b', 10);
    h = undo(h);
    h = commit(h, 'x', 10);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe('x');
  });

  it('ignores a commit of the same state', () => {
    const h = createHistory({ v: 1 });
    expect(commit(h, h.present, 10)).toBe(h);
  });

  it('keeps only the newest steps up to the limit', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 5; i++) h = commit(h, i, 3);
    expect(h.past).toEqual([2, 3, 4]);
    expect(h.present).toBe(5);
  });

  it('undo and redo at the ends change nothing', () => {
    const h = createHistory('only');
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});
