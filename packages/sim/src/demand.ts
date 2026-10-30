import {
  DEMAND_INTERVAL_TICKS,
  OVERFLOW_PIN_LIMIT,
  OVERFLOW_TICKS,
} from './config.ts';
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
    if (b.kind !== 'destination') continue;
    const demand = state.demand[b.id];
    if (!demand) continue;
    demand.cooldown = Math.max(0, demand.cooldown - 1);
    if (demand.cooldown > 0) continue;
    demand.pins += 1;
    demand.cooldown = DEMAND_INTERVAL_TICKS;
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
  if (demand.overflow > 0) demand.overflow = OVERFLOW_TICKS;
}

/** Starts, runs, or clears each destination's overflow countdown. Ends the game when one runs out. */
export function updateOverflow(state: SimState): void {
  for (const b of state.buildings) {
    if (b.kind !== 'destination') continue;
    const demand = state.demand[b.id];
    if (!demand) continue;
    if (demand.pins <= OVERFLOW_PIN_LIMIT) {
      demand.overflow = 0;
      continue;
    }
    if (demand.overflow === 0) {
      demand.overflow = OVERFLOW_TICKS;
      continue;
    }
    demand.overflow -= 1;
    if (demand.overflow === 0 && state.over === null) {
      state.over = { tick: state.tick, destination: b.id };
    }
  }
}
