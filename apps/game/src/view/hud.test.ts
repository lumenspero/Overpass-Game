import {
  createSim,
  createGrid,
  summaryOf,
  WEEK_TICKS,
  type GameSummary,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { endLines } from './hud.ts';

describe('endLines', () => {
  it('shows nothing while the game is on', () => {
    const summary: GameSummary = { week: 1, trips: 3, over: null };
    expect(endLines(summary)).toEqual([]);
  });

  it('shows the summary once the game is over', () => {
    const sim = createSim({ seed: 1, grid: createGrid(3, 3) });
    sim.over = { tick: WEEK_TICKS + 5, destination: 2 };
    sim.tripsCompleted = 7;
    expect(endLines(summaryOf(sim))).toEqual([
      'Game over',
      'Week 2',
      'Trips completed: 7',
    ]);
  });
});
