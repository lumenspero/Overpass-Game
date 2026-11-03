import { describe, expect, it } from 'vitest';
import {
  createIntentMapper,
  finishChain,
  pointerDown,
  pointerMove,
  pointerUp,
  setInputOptions,
  updateTimers,
  type PointerSample,
} from './intents.ts';

const mouse = (x: number, y: number, button = 0, id = 1): PointerSample => ({
  id,
  kind: 'mouse',
  x,
  y,
  button,
  time: 0,
});

/** A full left click at a point: press then release, with no movement. */
function click(m: ReturnType<typeof createIntentMapper>, x: number, y: number) {
  const p = mouse(x, y);
  return [...pointerDown(m, p), ...pointerUp(m, p)];
}

describe('waypoint drawing', () => {
  it('lays road from one click to the next, and the first click only sets the start', () => {
    const m = createIntentMapper('draw');
    setInputOptions(m, { drawMode: 'waypoints' });
    expect(click(m, 10, 10)).toEqual([]);
    expect(click(m, 50, 10)).toEqual([
      { type: 'stroke-begin', mode: 'draw', at: { x: 10, y: 10 } },
      { type: 'stroke-move', at: { x: 50, y: 10 } },
      { type: 'stroke-end', at: { x: 50, y: 10 } },
    ]);
    expect(click(m, 50, 60)).toEqual([
      { type: 'stroke-begin', mode: 'draw', at: { x: 50, y: 10 } },
      { type: 'stroke-move', at: { x: 50, y: 60 } },
      { type: 'stroke-end', at: { x: 50, y: 60 } },
    ]);
  });

  it('ends the chain on a right click, so the next click starts a new road', () => {
    const m = createIntentMapper('draw');
    setInputOptions(m, { drawMode: 'waypoints' });
    click(m, 10, 10);
    const right = mouse(0, 0, 2, 2);
    expect(pointerDown(m, right)).toEqual([]);
    expect(pointerUp(m, right)).toEqual([]);
    expect(click(m, 90, 10)).toEqual([]);
  });

  it('ends the chain on Esc', () => {
    const m = createIntentMapper('draw');
    setInputOptions(m, { drawMode: 'waypoints' });
    click(m, 10, 10);
    finishChain(m);
    expect(click(m, 90, 10)).toEqual([]);
  });

  it('ends the chain on a pan', () => {
    const m = createIntentMapper('draw');
    setInputOptions(m, { drawMode: 'waypoints' });
    click(m, 10, 10);
    const middle = mouse(0, 0, 1, 3);
    pointerDown(m, middle);
    pointerMove(m, { ...middle, x: 5, y: 5 });
    pointerUp(m, { ...middle, x: 5, y: 5 });
    expect(click(m, 90, 10)).toEqual([]);
  });

  it('keeps drag drawing when waypoints are off', () => {
    const m = createIntentMapper('draw');
    const down = mouse(10, 10);
    expect(pointerDown(m, down)).toEqual([
      { type: 'stroke-begin', mode: 'draw', at: { x: 10, y: 10 } },
    ]);
  });
});

describe('hold to erase', () => {
  it('erases a touch held still when on, and does nothing when off', () => {
    const touch: PointerSample = {
      id: 4,
      kind: 'touch',
      x: 20,
      y: 20,
      button: 0,
      time: 0,
    };

    const on = createIntentMapper('draw');
    pointerDown(on, touch);
    expect(updateTimers(on, 1000)).toEqual([
      { type: 'stroke-begin', mode: 'erase', at: { x: 20, y: 20 } },
    ]);

    const off = createIntentMapper('draw');
    setInputOptions(off, { holdToErase: false });
    pointerDown(off, touch);
    expect(updateTimers(off, 1000)).toEqual([]);
  });
});
