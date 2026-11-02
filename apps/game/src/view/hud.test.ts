import {
  createSim,
  createGrid,
  summaryOf,
  Terrain,
  WEEK_TICKS,
  type GameSummary,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { endLines, hudLine } from './hud.ts';

describe('hudLine', () => {
  it('shows the week, the seconds left in it, and trips', () => {
    const sim = createSim({ seed: 1, grid: createGrid(3, 3) });
    expect(hudLine(sim)).toBe('Week 1 · 60s left · Trips 0');
  });

  it('moves on to the next week', () => {
    const sim = createSim({ seed: 1, grid: createGrid(3, 3) });
    sim.tick = WEEK_TICKS;
    expect(hudLine(sim)).toBe('Week 2 · 60s left · Trips 0');
  });
});

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
      'Tap or press R to play again',
    ]);
  });
});

describe('hudLine paused marker', () => {
  it('adds a Paused marker only while the game runs paused', () => {
    const sim = createSim({ seed: 1, grid: createGrid(4, 4, Terrain.Land) });
    expect(hudLine(sim)).not.toContain('Paused');
    expect(hudLine(sim, true)).toMatch(/ · Paused$/);
    expect(hudLine(sim, false)).not.toContain('Paused');
  });
});
