import { LONG_PRESS_MS, TOUCH_SLOP_PX, WHEEL_ZOOM_RATE } from './config.ts';

/**
 * Turns raw pointer and wheel input into game intents. Pure: no Phaser, no DOM.
 * Coordinates are screen pixels; the scene converts them to tiles.
 *
 * Rules (M2):
 * - Mouse: left draws, right erases, middle drags to pan, wheel zooms.
 * - Pen: tip draws, barrel or eraser button erases.
 * - Touch: one finger draws once it moves past the slop; holding still past the
 *   long-press time erases instead; a tap places a single tile. A second finger
 *   cancels any stroke and starts pan + pinch-zoom until every finger is up.
 * - The erase tool turns every draw stroke into an erase stroke.
 */

export type PointerKind = 'mouse' | 'touch' | 'pen';
export type StrokeMode = 'draw' | 'erase';
export type Tool = 'draw' | 'erase';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PointerSample {
  id: number;
  kind: PointerKind;
  x: number;
  y: number;
  /** DOM button for down events: 0 left/tip, 1 middle, 2 right/barrel, 5 pen eraser. */
  button: number;
  time: number;
}

export type Intent =
  | { type: 'stroke-begin'; mode: StrokeMode; at: Vec2 }
  | { type: 'stroke-move'; at: Vec2 }
  | { type: 'stroke-end' }
  | { type: 'stroke-cancel' }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number; center: Vec2 };

interface TrackedPointer {
  kind: PointerKind;
  start: Vec2;
  last: Vec2;
  downTime: number;
}

type Mode =
  | { kind: 'idle' }
  /** Touch is down but hasn't decided between draw, erase and tap yet. */
  | { kind: 'pending'; id: number }
  | { kind: 'stroke'; id: number }
  | { kind: 'mouse-pan'; id: number }
  | { kind: 'gesture'; prevCentroid: Vec2; prevDistance: number }
  /** A gesture ended with fingers still down; ignore them until all lift. */
  | { kind: 'drain' };

export interface IntentMapper {
  tool: Tool;
  pointers: Map<number, TrackedPointer>;
  mode: Mode;
}

export function createIntentMapper(): IntentMapper {
  return { tool: 'draw', pointers: new Map(), mode: { kind: 'idle' } };
}

export function setTool(mapper: IntentMapper, tool: Tool): void {
  mapper.tool = tool;
}

function strokeMode(mapper: IntentMapper, wanted: StrokeMode): StrokeMode {
  return mapper.tool === 'erase' ? 'erase' : wanted;
}

function touchPair(mapper: IntentMapper): [Vec2, Vec2] | undefined {
  const touches = [...mapper.pointers.values()].filter(
    (p) => p.kind === 'touch',
  );
  if (touches.length < 2) return undefined;
  return [touches[0].last, touches[1].last];
}

function centroid(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointerDown(mapper: IntentMapper, p: PointerSample): Intent[] {
  const at = { x: p.x, y: p.y };
  mapper.pointers.set(p.id, {
    kind: p.kind,
    start: at,
    last: at,
    downTime: p.time,
  });
  const out: Intent[] = [];
  const mode = mapper.mode;

  if (p.kind === 'touch') {
    const pair = touchPair(mapper);
    if (pair) {
      if (mode.kind === 'stroke') out.push({ type: 'stroke-cancel' });
      if (mode.kind === 'gesture' || mode.kind === 'drain') return out;
      mapper.mode = {
        kind: 'gesture',
        prevCentroid: centroid(pair[0], pair[1]),
        prevDistance: distance(pair[0], pair[1]),
      };
      return out;
    }
    if (mode.kind === 'idle') mapper.mode = { kind: 'pending', id: p.id };
    return out;
  }

  // Mouse and pen: only one active pointer drives a stroke.
  if (mode.kind !== 'idle') return out;
  if (p.kind === 'mouse' && p.button === 1) {
    mapper.mode = { kind: 'mouse-pan', id: p.id };
    return out;
  }
  const wanted: StrokeMode =
    p.button === 2 || p.button === 5 ? 'erase' : 'draw';
  if (p.button !== 0 && p.button !== 2 && p.button !== 5) return out;
  mapper.mode = { kind: 'stroke', id: p.id };
  out.push({ type: 'stroke-begin', mode: strokeMode(mapper, wanted), at });
  return out;
}

export function pointerMove(mapper: IntentMapper, p: PointerSample): Intent[] {
  const tracked = mapper.pointers.get(p.id);
  if (!tracked) return [];
  const prev = tracked.last;
  const at = { x: p.x, y: p.y };
  tracked.last = at;
  const mode = mapper.mode;

  switch (mode.kind) {
    case 'pending': {
      if (mode.id !== p.id) return [];
      if (distance(tracked.start, at) <= TOUCH_SLOP_PX) return [];
      mapper.mode = { kind: 'stroke', id: p.id };
      return [
        {
          type: 'stroke-begin',
          mode: strokeMode(mapper, 'draw'),
          at: tracked.start,
        },
        { type: 'stroke-move', at },
      ];
    }
    case 'stroke':
      return mode.id === p.id ? [{ type: 'stroke-move', at }] : [];
    case 'mouse-pan':
      return mode.id === p.id
        ? [{ type: 'pan', dx: at.x - prev.x, dy: at.y - prev.y }]
        : [];
    case 'gesture': {
      const pair = touchPair(mapper);
      if (!pair) return [];
      const c = centroid(pair[0], pair[1]);
      const d = distance(pair[0], pair[1]);
      const out: Intent[] = [];
      const dx = c.x - mode.prevCentroid.x;
      const dy = c.y - mode.prevCentroid.y;
      if (dx !== 0 || dy !== 0) out.push({ type: 'pan', dx, dy });
      if (mode.prevDistance > 0 && d > 0 && d !== mode.prevDistance) {
        out.push({ type: 'zoom', factor: d / mode.prevDistance, center: c });
      }
      mode.prevCentroid = c;
      mode.prevDistance = d;
      return out;
    }
    default:
      return [];
  }
}

export function pointerUp(mapper: IntentMapper, p: PointerSample): Intent[] {
  const tracked = mapper.pointers.get(p.id);
  if (!tracked) return [];
  mapper.pointers.delete(p.id);
  const mode = mapper.mode;
  let out: Intent[] = [];

  switch (mode.kind) {
    case 'pending':
      if (mode.id === p.id) {
        // A tap: place one tile where the finger went down.
        out = [
          {
            type: 'stroke-begin',
            mode: strokeMode(mapper, 'draw'),
            at: tracked.start,
          },
          { type: 'stroke-end' },
        ];
        mapper.mode = { kind: 'idle' };
      }
      break;
    case 'stroke':
      if (mode.id === p.id) {
        out = [{ type: 'stroke-end' }];
        mapper.mode = { kind: 'idle' };
      }
      break;
    case 'mouse-pan':
      if (mode.id === p.id) mapper.mode = { kind: 'idle' };
      break;
    case 'gesture':
      mapper.mode = touchPair(mapper) ? mode : { kind: 'drain' };
      break;
    default:
      break;
  }
  if (mapper.mode.kind === 'drain' && mapper.pointers.size === 0) {
    mapper.mode = { kind: 'idle' };
  }
  return out;
}

/** Pointer lost (browser took over, window blurred). Never commits a stroke. */
export function pointerCancel(
  mapper: IntentMapper,
  p: PointerSample,
): Intent[] {
  if (!mapper.pointers.has(p.id)) return [];
  const mode = mapper.mode;
  const wasStroke = mode.kind === 'stroke' && mode.id === p.id;
  mapper.pointers.delete(p.id);
  if (
    (mode.kind === 'pending' ||
      mode.kind === 'stroke' ||
      mode.kind === 'mouse-pan') &&
    mode.id === p.id
  ) {
    mapper.mode = { kind: 'idle' };
  } else if (mode.kind === 'gesture' && !touchPair(mapper)) {
    mapper.mode = { kind: 'drain' };
  }
  if (mapper.mode.kind === 'drain' && mapper.pointers.size === 0) {
    mapper.mode = { kind: 'idle' };
  }
  return wasStroke ? [{ type: 'stroke-cancel' }] : [];
}

/** Call every frame so a held, still touch can become an erase stroke. */
export function updateTimers(mapper: IntentMapper, now: number): Intent[] {
  const mode = mapper.mode;
  if (mode.kind !== 'pending') return [];
  const tracked = mapper.pointers.get(mode.id);
  if (!tracked || now - tracked.downTime < LONG_PRESS_MS) return [];
  mapper.mode = { kind: 'stroke', id: mode.id };
  return [{ type: 'stroke-begin', mode: 'erase', at: tracked.start }];
}

export function wheel(deltaY: number, at: Vec2): Intent[] {
  if (deltaY === 0) return [];
  return [
    { type: 'zoom', factor: Math.exp(-deltaY * WHEEL_ZOOM_RATE), center: at },
  ];
}
