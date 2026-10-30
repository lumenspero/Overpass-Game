import { tuning } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { crossingHint, crossingMessage } from './crossing-message.ts';

describe('crossingMessage', () => {
  it('says what was built', () => {
    expect(
      crossingMessage('bridge', { ok: true, added: 4, crossings: 1 }),
    ).toBe('Bridge built');
    expect(
      crossingMessage('tunnel', { ok: true, added: 4, crossings: 2 }),
    ).toBe('Tunnel built (2 crossings)');
  });

  it('explains a missing bridge in plain words', () => {
    expect(crossingMessage('bridge', { ok: false, reason: 'no-stock' })).toBe(
      'No bridges to lay. Pick one from the reward panel.',
    );
  });

  it('names the span limit from the tuning', () => {
    expect(crossingMessage('bridge', { ok: false, reason: 'too-long' })).toBe(
      `A bridge can cross at most ${tuning.BRIDGE_MAX_SPAN} tiles of water.`,
    );
    expect(crossingMessage('tunnel', { ok: false, reason: 'too-long' })).toBe(
      `A tunnel can cross at most ${tuning.TUNNEL_MAX_SPAN} tiles of mountain.`,
    );
  });

  it('has a non-empty line for every refusal', () => {
    const reasons = [
      'out-of-bounds',
      'no-span',
      'not-a-path',
      'bad-endpoint',
      'blocked',
      'locked',
      'too-long',
      'no-stock',
      'no-budget',
    ] as const;
    for (const kind of ['bridge', 'tunnel'] as const) {
      for (const reason of reasons) {
        expect(
          crossingMessage(kind, { ok: false, reason }).length,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe('crossingHint', () => {
  it('shows the stock of the picked tool', () => {
    expect(crossingHint('bridge', 0)).toBe('Bridge tool · 0 in stock');
    expect(crossingHint('tunnel', 2)).toBe('Tunnel tool · 2 in stock');
  });
});
