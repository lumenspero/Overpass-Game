import { describe, expect, it } from 'vitest';
import { emitEvent, takeEvents } from '../src/events.ts';
import { createSim, step, tuning } from '../src/index.ts';
import { makeGrid } from './helpers.ts';

describe('sim events', () => {
  it('returns what was emitted, then clears it', () => {
    takeEvents();
    emitEvent({ kind: 'game-over', destination: 4 });
    expect(takeEvents()).toEqual([{ kind: 'game-over', destination: 4 }]);
    expect(takeEvents()).toEqual([]);
  });

  it('reports the week that ended when a week boundary is reached', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(4, 4), roadBudget: 0 });
    sim.tick = tuning.WEEK_TICKS - 1;
    const events = step(sim);
    expect(events).toContainEqual({ kind: 'week-ended', week: 1 });
  });

  it('reports nothing on an ordinary tick with no game in progress', () => {
    const sim = createSim({ seed: 1, grid: makeGrid(4, 4), roadBudget: 0 });
    sim.tick = 1;
    expect(step(sim).some((e) => e.kind === 'week-ended')).toBe(false);
  });
});
