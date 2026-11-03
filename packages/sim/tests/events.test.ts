import { describe, expect, it } from 'vitest';
import { emitEvent, takeEvents } from '../src/events.ts';

describe('sim events', () => {
  it('returns what was emitted, then clears it', () => {
    takeEvents();
    emitEvent({ kind: 'game-over', destination: 4 });
    expect(takeEvents()).toEqual([{ kind: 'game-over', destination: 4 }]);
    expect(takeEvents()).toEqual([]);
  });
});
