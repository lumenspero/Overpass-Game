import type { Stock, Unlocked, UpgradeKind } from '@overpass-game/sim';

/**
 * The inventory dock's items, in the original's order (spec: Upgrades). Pure, so it can be
 * tested without the DOM. An upgrade appears once the player has had it this run; after that it
 * stays in the dock, grayed out when empty, because it can be taken off the map and stored again.
 * Road tiles always show: they are the budget.
 */

export type DockId =
  'roundabout' | 'motorway' | 'light' | 'tiles' | 'bridge' | 'tunnel';

export const DOCK_ORDER: readonly DockId[] = [
  'roundabout',
  'motorway',
  'light',
  'tiles',
  'bridge',
  'tunnel',
];

export const DOCK_LABELS: Record<DockId, string> = {
  roundabout: 'Roundabout',
  motorway: 'Motorway',
  light: 'Traffic light',
  tiles: 'Road tiles',
  bridge: 'Bridge',
  tunnel: 'Tunnel',
};

export interface DockItem {
  id: DockId;
  label: string;
  count: number;
  /** Shown at all: unlocked this run, or road tiles. */
  shown: boolean;
  /** Shown in full colour when there is at least one. */
  enabled: boolean;
  /** Can be picked up and placed. Road tiles are a budget, not a piece. */
  armable: boolean;
}

export function dockItems(
  stock: Stock,
  budget: number,
  unlocked: Unlocked,
): DockItem[] {
  return DOCK_ORDER.flatMap((id): DockItem[] => {
    if (id === 'tiles') {
      return [
        {
          id,
          label: DOCK_LABELS[id],
          count: budget,
          shown: true,
          enabled: budget > 0,
          armable: false,
        },
      ];
    }
    const kind: UpgradeKind = id === 'light' ? 'light' : id;
    const count = stock[kind];
    if (!unlocked[kind]) return [];
    return [
      {
        id,
        label: DOCK_LABELS[id],
        count,
        shown: true,
        enabled: count > 0,
        armable: count > 0,
      },
    ];
  });
}
