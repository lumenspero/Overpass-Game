import type { SimEvent } from '@overpass-game/sim';
import type { SoundEvent } from './catalog.ts';

/** The sound for a sim event, or null if the event makes no sound. */
export function soundForSimEvent(event: SimEvent): SoundEvent | null {
  switch (event.kind) {
    case 'building-spawned':
      return 'building.spawn';
    case 'game-over':
      return 'game.over';
    default:
      return null;
  }
}
