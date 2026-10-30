import {
  chooseUpgrade,
  createSim,
  createGrid,
  type SimState,
} from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { offerView } from './offer.ts';

function world(): SimState {
  return createSim({ seed: 1, grid: createGrid(3, 3), roadBudget: 0 });
}

describe('offerView', () => {
  it('shows nothing when no offer is waiting', () => {
    expect(offerView(world())).toBeNull();
  });

  it('shows the oldest offer with labelled choices and a count', () => {
    const sim = world();
    sim.offers = [
      ['bridge', 'tunnel'],
      ['light', 'motorway'],
    ];
    expect(offerView(sim)).toEqual({
      pending: 2,
      choices: [
        { kind: 'bridge', label: 'Bridge' },
        { kind: 'tunnel', label: 'Tunnel' },
      ],
    });
  });

  it('moves on to the next offer once one is answered', () => {
    const sim = world();
    sim.offers = [
      ['bridge', 'tunnel'],
      ['light', 'motorway'],
    ];
    chooseUpgrade(sim, 'bridge');
    expect(offerView(sim)?.choices[0].kind).toBe('light');
  });

  it('shows nothing once the game is over', () => {
    const sim = world();
    sim.offers = [['bridge', 'tunnel']];
    sim.over = { tick: 0, destination: 0 };
    expect(offerView(sim)).toBeNull();
  });
});
