import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS, TOUCH_SLOP_PX } from './config.ts';
import {
  createIntentMapper,
  type Intent,
  type PointerKind,
  type PointerSample,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  setTool,
  updateTimers,
  wheel,
} from './intents.ts';

function sample(
  id: number,
  kind: PointerKind,
  x: number,
  y: number,
  time = 0,
  button = 0,
): PointerSample {
  return { id, kind, x, y, time, button };
}

const types = (intents: Intent[]): string[] => intents.map((i) => i.type);

describe('mouse', () => {
  it('left button draws a stroke', () => {
    const m = createIntentMapper();
    expect(pointerDown(m, sample(1, 'mouse', 10, 10))).toEqual([
      { type: 'stroke-begin', mode: 'draw', at: { x: 10, y: 10 } },
    ]);
    expect(pointerMove(m, sample(1, 'mouse', 20, 10))).toEqual([
      { type: 'stroke-move', at: { x: 20, y: 10 } },
    ]);
    expect(pointerUp(m, sample(1, 'mouse', 20, 10))).toEqual([
      { type: 'stroke-end' },
    ]);
    expect(m.mode.kind).toBe('idle');
  });

  it('right button erases', () => {
    const m = createIntentMapper();
    const out = pointerDown(m, sample(1, 'mouse', 0, 0, 0, 2));
    expect(out[0]).toMatchObject({ type: 'stroke-begin', mode: 'erase' });
  });

  it('middle button pans without a stroke', () => {
    const m = createIntentMapper();
    expect(pointerDown(m, sample(1, 'mouse', 0, 0, 0, 1))).toEqual([]);
    expect(pointerMove(m, sample(1, 'mouse', 5, -3))).toEqual([
      { type: 'pan', dx: 5, dy: -3 },
    ]);
    expect(pointerUp(m, sample(1, 'mouse', 5, -3))).toEqual([]);
  });

  it('ignores moves with no button held', () => {
    const m = createIntentMapper();
    expect(pointerMove(m, sample(1, 'mouse', 5, 5))).toEqual([]);
  });

  it('wheel zooms in on scroll up and out on scroll down', () => {
    const [up] = wheel(-100, { x: 4, y: 5 });
    const [down] = wheel(100, { x: 4, y: 5 });
    expect(up).toMatchObject({ type: 'zoom', center: { x: 4, y: 5 } });
    expect(up.type === 'zoom' && up.factor).toBeGreaterThan(1);
    expect(down.type === 'zoom' && down.factor).toBeLessThan(1);
    expect(wheel(0, { x: 0, y: 0 })).toEqual([]);
  });
});

describe('pen', () => {
  it('tip draws, eraser button erases', () => {
    const m = createIntentMapper();
    expect(pointerDown(m, sample(1, 'pen', 0, 0))[0]).toMatchObject({
      mode: 'draw',
    });
    pointerUp(m, sample(1, 'pen', 0, 0));
    expect(pointerDown(m, sample(2, 'pen', 0, 0, 0, 5))[0]).toMatchObject({
      mode: 'erase',
    });
  });
});

describe('erase tool', () => {
  it('turns mouse and touch draw strokes into erase strokes', () => {
    const m = createIntentMapper();
    setTool(m, 'erase');
    expect(pointerDown(m, sample(1, 'mouse', 0, 0))[0]).toMatchObject({
      mode: 'erase',
    });
    pointerUp(m, sample(1, 'mouse', 0, 0));
    pointerDown(m, sample(2, 'touch', 0, 0));
    const out = pointerMove(m, sample(2, 'touch', 50, 0));
    expect(out[0]).toMatchObject({ type: 'stroke-begin', mode: 'erase' });
  });
});

describe('one finger', () => {
  it('waits for the slop before drawing, starting at the touch point', () => {
    const m = createIntentMapper();
    expect(pointerDown(m, sample(1, 'touch', 100, 100))).toEqual([]);
    expect(
      pointerMove(m, sample(1, 'touch', 100 + TOUCH_SLOP_PX, 100)),
    ).toEqual([]);
    expect(pointerMove(m, sample(1, 'touch', 130, 100))).toEqual([
      { type: 'stroke-begin', mode: 'draw', at: { x: 100, y: 100 } },
      { type: 'stroke-move', at: { x: 130, y: 100 } },
    ]);
    expect(types(pointerUp(m, sample(1, 'touch', 130, 100)))).toEqual([
      'stroke-end',
    ]);
  });

  it('a tap places a single tile', () => {
    const m = createIntentMapper();
    pointerDown(m, sample(1, 'touch', 40, 40));
    expect(pointerUp(m, sample(1, 'touch', 42, 41, 100))).toEqual([
      { type: 'stroke-begin', mode: 'draw', at: { x: 40, y: 40 } },
      { type: 'stroke-end' },
    ]);
  });

  it('a long press becomes an erase stroke', () => {
    const m = createIntentMapper();
    pointerDown(m, sample(1, 'touch', 40, 40, 1000));
    expect(updateTimers(m, 1000 + LONG_PRESS_MS - 1)).toEqual([]);
    expect(updateTimers(m, 1000 + LONG_PRESS_MS)).toEqual([
      { type: 'stroke-begin', mode: 'erase', at: { x: 40, y: 40 } },
    ]);
    expect(types(pointerMove(m, sample(1, 'touch', 80, 40)))).toEqual([
      'stroke-move',
    ]);
    expect(types(pointerUp(m, sample(1, 'touch', 80, 40)))).toEqual([
      'stroke-end',
    ]);
  });

  it('a moving touch never long-presses', () => {
    const m = createIntentMapper();
    pointerDown(m, sample(1, 'touch', 0, 0, 0));
    pointerMove(m, sample(1, 'touch', 50, 0, 10));
    expect(updateTimers(m, LONG_PRESS_MS * 2)).toEqual([]);
  });
});

describe('two fingers', () => {
  it('a second finger cancels the stroke, then pans and zooms', () => {
    const m = createIntentMapper();
    pointerDown(m, sample(1, 'touch', 0, 0));
    pointerMove(m, sample(1, 'touch', 30, 0));
    expect(pointerDown(m, sample(2, 'touch', 130, 0))).toEqual([
      { type: 'stroke-cancel' },
    ]);
    // Pointer events arrive one finger at a time, so check the net effect.
    const net = (intents: Intent[]): { dx: number; zoom: number } => {
      let dx = 0;
      let zoom = 1;
      for (const i of intents) {
        if (i.type === 'pan') dx += i.dx;
        if (i.type === 'zoom') zoom *= i.factor;
      }
      return { dx, zoom };
    };
    // Both fingers move right by 10: net pan 10, no net zoom.
    const pan = net([
      ...pointerMove(m, sample(1, 'touch', 40, 0)),
      ...pointerMove(m, sample(2, 'touch', 140, 0)),
    ]);
    expect(pan.dx).toBeCloseTo(10);
    expect(pan.zoom).toBeCloseTo(1);
    // Spread from 100px apart to 120px around a fixed centroid: zoom 1.2, no net pan.
    const zoom = net([
      ...pointerMove(m, sample(1, 'touch', 30, 0)),
      ...pointerMove(m, sample(2, 'touch', 150, 0)),
    ]);
    expect(zoom.dx).toBeCloseTo(0);
    expect(zoom.zoom).toBeCloseTo(1.2);
  });

  it('a second finger during the pending phase never draws', () => {
    const m = createIntentMapper();
    pointerDown(m, sample(1, 'touch', 0, 0));
    expect(pointerDown(m, sample(2, 'touch', 100, 0))).toEqual([]);
    expect(m.mode.kind).toBe('gesture');
  });

  it('the remaining finger does nothing until every finger lifts', () => {
    const m = createIntentMapper();
    pointerDown(m, sample(1, 'touch', 0, 0));
    pointerDown(m, sample(2, 'touch', 100, 0));
    expect(pointerUp(m, sample(2, 'touch', 100, 0))).toEqual([]);
    expect(pointerMove(m, sample(1, 'touch', 60, 0))).toEqual([]);
    expect(updateTimers(m, LONG_PRESS_MS * 10)).toEqual([]);
    expect(pointerUp(m, sample(1, 'touch', 60, 0))).toEqual([]);
    expect(m.mode.kind).toBe('idle');
    // Next single touch draws normally again.
    pointerDown(m, sample(3, 'touch', 0, 0));
    expect(types(pointerMove(m, sample(3, 'touch', 50, 0)))).toEqual([
      'stroke-begin',
      'stroke-move',
    ]);
  });
});

describe('cancel', () => {
  it('a cancelled stroke emits stroke-cancel, never stroke-end', () => {
    const m = createIntentMapper();
    pointerDown(m, sample(1, 'mouse', 0, 0));
    expect(pointerCancel(m, sample(1, 'mouse', 0, 0))).toEqual([
      { type: 'stroke-cancel' },
    ]);
    expect(m.mode.kind).toBe('idle');
  });

  it('cancelling a pending touch emits nothing', () => {
    const m = createIntentMapper();
    pointerDown(m, sample(1, 'touch', 0, 0));
    expect(pointerCancel(m, sample(1, 'touch', 0, 0))).toEqual([]);
    expect(m.mode.kind).toBe('idle');
  });
});
