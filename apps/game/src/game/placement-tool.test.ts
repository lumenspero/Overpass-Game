import { describe, expect, it } from 'vitest';
import { toolAfterPlacement } from './placement-tool.ts';

const report = (seq: number, ok: boolean) => ({ seq, kind: 'bridge', ok });

describe('placement tools hand back after one piece', () => {
  it('returns to the default tool once a bridge, tunnel, motorway, roundabout or light is placed', () => {
    for (const tool of [
      'bridge',
      'tunnel',
      'motorway',
      'roundabout',
      'light',
    ] as const) {
      expect(toolAfterPlacement(tool, report(1, true), report(2, true))).toBe(
        'select',
      );
    }
    expect(toolAfterPlacement('light', null, report(1, true))).toBe('select');
  });

  it('keeps the tool when the placement was refused, or nothing new was placed', () => {
    expect(
      toolAfterPlacement('bridge', report(1, true), report(2, false)),
    ).toBe('bridge');
    expect(
      toolAfterPlacement('motorway', report(3, true), report(3, true)),
    ).toBe('motorway');
  });

  it('leaves the road, erase and default tools alone, even when a road stroke builds a bridge', () => {
    for (const tool of ['draw', 'erase', 'select'] as const) {
      expect(toolAfterPlacement(tool, report(1, true), report(2, true))).toBe(
        tool,
      );
    }
  });
});
