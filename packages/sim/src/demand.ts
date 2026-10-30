import { DEMAND_INTERVAL_TICKS } from './config.ts';
import type { SimState } from './sim.ts';

/**
 * Demand (spec: Demand). Each destination collects one pin every DEMAND_INTERVAL_TICKS,
 * whether or not it is connected. A house only sends a car to a destination that has an
 * unclaimed pin. A pin is claimed by a car while it drives there, and used up when the car
 * arrives. A car that never arrives (lost, or sent home) leaves its pin for the next car.
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

/** Uses up one pin at a destination, as a car arrives there. */
export function servePin(state: SimState, destination: number): void {
  const demand = state.demand[destination];
  if (demand && demand.pins > 0) demand.pins -= 1;
}
