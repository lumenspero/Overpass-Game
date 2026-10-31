import { describe, expect, it } from 'vitest';
import { guideWorldLines } from './guide.ts';

describe('guideWorldLines', () => {
  it('scales grid points to world pixels', () => {
    const [line] = guideWorldLines(
      [
        [
          { x: 0.5, y: 1 },
          { x: 2, y: 0 },
        ],
      ],
      10,
    );
    expect(line).toEqual([
      { x: 5, y: 10 },
      { x: 20, y: 0 },
    ]);
  });

  it('keeps one line per input line, in order', () => {
    const lines = guideWorldLines(
      [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        [
          { x: 0, y: 1 },
          { x: 0, y: 2 },
        ],
      ],
      10,
    );
    expect(lines).toHaveLength(2);
    expect(lines[1][1]).toEqual({ x: 0, y: 20 });
  });

  it('returns no lines when there are none', () => {
    expect(guideWorldLines([])).toEqual([]);
  });
});
