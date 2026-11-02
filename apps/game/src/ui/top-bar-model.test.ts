import { describe, expect, it } from 'vitest';
import { choiceOf, clockFor, FAST_FORWARD_SPEED } from './top-bar-model.ts';

describe('choiceOf', () => {
  it('lights pause while the clock is stopped', () => {
    expect(choiceOf(true, 1)).toBe('pause');
    expect(choiceOf(true, 2)).toBe('pause');
  });

  it('lights play at normal speed and fast-forward above it', () => {
    expect(choiceOf(false, 1)).toBe('play');
    expect(choiceOf(false, 2)).toBe('fast');
    expect(choiceOf(false, 8)).toBe('fast');
  });
});

describe('clockFor', () => {
  it('play runs at normal speed', () => {
    expect(clockFor('play', 2)).toEqual({ paused: false, speed: 1 });
  });

  it('fast-forward runs at 2×', () => {
    expect(FAST_FORWARD_SPEED).toBe(2);
    expect(clockFor('fast', 1)).toEqual({ paused: false, speed: 2 });
  });

  it('pause stops the clock and keeps the speed for when it resumes', () => {
    expect(clockFor('pause', 2)).toEqual({ paused: true, speed: 2 });
  });
});
