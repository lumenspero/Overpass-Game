import {
  chooseOffer,
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
      ['bridge', 'tiles'],
      ['lights', 'motorway'],
    ];
    const view = offerView(sim);
    expect(view?.pending).toBe(2);
    expect(view?.choices.map((c) => [c.id, c.label])).toEqual([
      ['bridge', 'Bridge'],
      ['tiles', 'Road tiles'],
    ]);
    expect(view?.choices[1].option.tiles).toBe(30);
  });

  it('moves on to the next offer once one is answered', () => {
    const sim = world();
    sim.offers = [
      ['bridge', 'tiles'],
      ['lights', 'motorway'],
    ];
    chooseOffer(sim, 'bridge');
    expect(offerView(sim)?.choices[0].id).toBe('lights');
  });

  it('shows nothing once the game is over', () => {
    const sim = world();
    sim.offers = [['bridge', 'tiles']];
    sim.over = { tick: 0, destination: 0 };
    expect(offerView(sim)).toBeNull();
  });
});
