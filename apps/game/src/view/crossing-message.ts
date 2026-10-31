import {
  type ControlKind,
  type ControlResult,
  type DestinationResult,
  type CrossingKind,
  type CrossingResult,
  type MotorwayResult,
  tuning,
} from '@overpass-game/sim';

/** How long a crossing's result stays on screen, in milliseconds. */
export const CROSSING_MESSAGE_MS = 3000;

/** The line shown after a bridge or tunnel is released: what was built, or why not. */
export function crossingMessage(
  kind: CrossingKind,
  result: CrossingResult,
): string {
  const name = kind === 'bridge' ? 'Bridge' : 'Tunnel';
  if (result.ok) {
    return result.crossings > 1
      ? `${name} built (${result.crossings} crossings)`
      : `${name} built`;
  }
  switch (result.reason) {
    case 'no-stock':
      return `No ${kind}s to lay. Pick one from the reward panel.`;
    case 'bad-endpoint':
      return 'Start and finish on land or road, not on water, mountain or a building.';
    case 'locked':
      return 'That land is not open yet.';
    case 'too-long': {
      const max =
        kind === 'bridge' ? tuning.BRIDGE_MAX_SPAN : tuning.TUNNEL_MAX_SPAN;
      const terrain = kind === 'bridge' ? 'water' : 'mountain';
      return `A ${kind} can cross at most ${max} tiles of ${terrain}.`;
    }
    case 'no-budget':
      return 'Not enough budget for that road.';
    case 'blocked':
      return 'Something is in the way.';
    case 'no-span':
    case 'not-a-path':
      return 'Drag one line from one bank to the other.';
    case 'out-of-bounds':
      return 'Stay on the map.';
  }
}

/** The line shown after a motorway is released: what was built, or why not. */
export function motorwayMessage(result: MotorwayResult): string {
  if (result.ok) return 'Motorway built';
  switch (result.reason) {
    case 'no-stock':
      return 'No motorways to lay. Pick one from the reward panel.';
    case 'bad-endpoint':
      return 'Start and finish on road tiles, not next to each other.';
    case 'locked':
      return 'That land is not open yet.';
    case 'blocked':
      return 'A road already has a motorway ramp there.';
    case 'too-long':
      return `A motorway can span at most ${tuning.MOTORWAY_MAX_LENGTH} tiles.`;
    case 'no-budget':
      return 'Not enough budget for that motorway.';
    case 'out-of-bounds':
      return 'Keep the motorway on the map.';
    case 'bad-handle':
      return 'Press a handle of the motorway to move it.';
  }
}

/** The line shown after a roundabout or light is placed: what was built, or why not. */
export function controlMessage(
  kind: ControlKind,
  result: ControlResult,
): string {
  const name = kind === 'roundabout' ? 'Roundabout' : 'Light';
  if (result.ok) return `${name} built`;
  switch (result.reason) {
    case 'out-of-bounds':
      return 'Stay on the map.';
    case 'bad-endpoint':
      return `A ${kind} goes on land or road, not on a building, mountain or water.`;
    case 'locked':
      return 'That land is not open yet.';
    case 'occupied':
      return 'That junction already has a roundabout or light.';
    case 'no-stock':
      return `No ${kind === 'roundabout' ? 'roundabouts' : 'lights'} to place. Pick one from the reward panel.`;
  }
}

/** The line shown after a destination upgrade is placed: what was done, or why not. */
export function destinationMessage(result: DestinationResult): string {
  if (result.ok) return 'Destination upgraded';
  switch (result.reason) {
    case 'not-a-destination':
      return 'Upgrades go on destinations, the buildings cars drive to.';
    case 'max-upgrades':
      return `A destination takes at most ${tuning.DESTINATION_MAX_UPGRADES} upgrades.`;
    case 'no-stock':
      return 'No destination upgrades to place. Pick one from the reward panel.';
  }
}

/** The line shown while a crossing tool is picked: how many are in stock. */
export function crossingHint(
  kind: CrossingKind | 'motorway' | 'roundabout' | 'light' | 'destination',
  stock: number,
): string {
  const name =
    kind === 'bridge'
      ? 'Bridge'
      : kind === 'tunnel'
        ? 'Tunnel'
        : kind === 'roundabout'
          ? 'Roundabout'
          : kind === 'light'
            ? 'Light'
            : kind === 'destination'
              ? 'Destination upgrade'
              : 'Motorway';
  return `${name} tool · ${stock} in stock`;
}
