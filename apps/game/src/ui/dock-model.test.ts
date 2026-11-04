import { emptyStock, emptyUnlocked } from '@overpass-game/sim';
import { describe, expect, it } from 'vitest';
import { dockItems } from './dock-model.ts';

describe('dockItems', () => {
  it('shows only road tiles before anything is unlocked', () => {
    expect(
      dockItems(emptyStock(), 0, emptyUnlocked()).map((i) => i.id),
    ).toEqual(['tiles']);
  });

  it('keeps an unlocked upgrade in the dock, grayed out when empty', () => {
    const unlocked = emptyUnlocked();
    unlocked.bridge = true;
    const bridge = dockItems(emptyStock(), 0, unlocked).find(
      (i) => i.id === 'bridge',
    );
    expect(bridge).toMatchObject({
      count: 0,
      enabled: false,
      armable: false,
      shown: true,
    });
  });

  it('keeps the original order of the unlocked items', () => {
    const unlocked = emptyUnlocked();
    unlocked.tunnel = true;
    unlocked.light = true;
    unlocked.roundabout = true;
    expect(dockItems(emptyStock(), 0, unlocked).map((i) => i.id)).toEqual([
      'roundabout',
      'light',
      'tiles',
      'tunnel',
    ]);
  });

  it('counts stock and makes stocked items armable', () => {
    const stock = emptyStock();
    stock.light = 2;
    const unlocked = emptyUnlocked();
    unlocked.light = true;
    const light = dockItems(stock, 0, unlocked).find((i) => i.id === 'light');
    expect(light).toMatchObject({ count: 2, enabled: true, armable: true });
  });

  it('shows road tiles from the budget, never armable', () => {
    const tiles = dockItems(emptyStock(), 42, emptyUnlocked()).find(
      (i) => i.id === 'tiles',
    );
    expect(tiles).toMatchObject({ count: 42, enabled: true, armable: false });
  });
});
