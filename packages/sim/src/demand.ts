import { tuning, demandIntervalFor } from './config.ts';
import { isOpenTile } from './expansion.ts';
import type { Demand } from './buildings.ts';
import { emitEvent } from './events.ts';
import type { SimState } from './sim.ts';

/**
 * Demand (spec: Demand, Overflow). Each destination collects one pin every
 * DEMAND_INTERVAL_TICKS, whether or not it is connected. A house only sends a car to a
 * destination that has an unclaimed pin. A pin is claimed by a car while it drives there,
 * and used up when the car arrives. A car that never arrives (lost, or sent home) leaves
 * its pin for the next car.
 *
 * A destination holding more than OVERFLOW_PIN_LIMIT pins starts a countdown. Serving a
 * pin resets it. Dropping back to the limit clears it. When a countdown runs out, the game ends.
 */

/** Adds one pin to each destination whose cooldown has run down. */
export function generateDemand(state: SimState): void {
  for (const b of state.buildings) {
    if (b.kind !== 'destination' || !isOpenTile(state, b.tile)) continue;
    const demand = state.demand[b.id];
    if (!demand) continue;
    demand.cooldown = Math.max(0, demand.cooldown - 1);
    if (demand.cooldown > 0) continue;
    demand.pins += 1;
    emitEvent({ kind: 'pin-appeared', destination: b.id });
    demand.cooldown = cooldownFor(demand, b.shape);
  }
}

/** Pins at a destination that no car is on its way to yet. */
export function unclaimedPins(state: SimState, destination: number): number {
  const demand = state.demand[destination];
  if (!demand) return 0;
  let driving = 0;
  for (const car of state.cars) {
    if (car.state === 'driving' && car.destination === destination)
      driving += 1;
  }
  return demand.pins - driving;
}

/** Uses up one pin at a destination, as a car arrives there. Resets its overflow countdown. */
export function servePin(state: SimState, destination: number): void {
  const demand = state.demand[destination];
  if (!demand || demand.pins === 0) return;
  demand.pins -= 1;
  if (demand.overflow > 0) demand.overflow = tuning.OVERFLOW_TICKS;
}

/**
 * Adds a pin at a destination straight away. For the debug panel: it lets a tester push a
 * destination towards overflow without waiting. Returns false if there is no destination there.
 */
export function addDemandPin(state: SimState, destination: number): boolean {
  const demand = state.demand[destination];
  if (!demand) return false;
  demand.pins += 1;
  return true;
}

/** Starts, runs, or clears each destination's overflow countdown. Ends the game when one runs out. */
export function updateOverflow(state: SimState): void {
  for (const b of state.buildings) {
    if (b.kind !== 'destination' || !isOpenTile(state, b.tile)) continue;
    const demand = state.demand[b.id];
    if (!demand) continue;
    if (demand.pins <= tuning.OVERFLOW_PIN_LIMIT) {
      demand.overflow = 0;
      continue;
    }
    if (demand.overflow === 0) {
      demand.overflow = tuning.OVERFLOW_TICKS;
      emitEvent({ kind: 'overflow-started', destination: b.id });
      continue;
    }
    demand.overflow -= 1;
    // Once a second while the countdown runs, so the sound can tick without a call every tick.
    if (demand.overflow % tuning.TICKS_PER_SECOND === 0) {
      emitEvent({
        kind: 'overflow-countdown',
        destination: b.id,
        ticksLeft: demand.overflow,
      });
    }
    if (demand.overflow === 0 && state.over === null) {
      state.over = { tick: state.tick, destination: b.id };
      emitEvent({ kind: 'game-over', destination: b.id });
    }
  }
}

/** How much faster than the base rate a destination draws pins: weekly growth adds to it. */
export function demandRate(demand: Demand): number {
  return 1 + demand.growth * tuning.DEMAND_GROWTH_STEP;
}

/** Ticks between one pin and the next at this destination's rate and shape. */
function cooldownFor(
  demand: Demand,
  shape: 'square' | 'round' | undefined,
): number {
  return Math.max(1, Math.round(demandIntervalFor(shape) / demandRate(demand)));
}

/** Every destination grows by one step. Called once a week. */
export function growDestinations(state: SimState): void {
  for (const b of state.buildings) {
    const demand = state.demand[b.id];
    if (b.kind === 'destination' && demand) demand.growth += 1;
  }
}
