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
 * A destination holds at most OVERFLOW_PIN_LIMIT pins that no car is on its way to. A request that arrives
 * while that many wait starts its overflow pin. Pins with a car coming do not count, so a business only
 * overflows once its houses cannot send cars fast enough. The overflow pin fills steadily, in the time OVERFLOW_FILL_PINS more requests would take. Each car
 * that arrives drains one OVERFLOW_FILL_PINS-th of the fill before it uses up a pin. When the fill empties
 * the overflow ends; when it is full, the game ends.
 */

/**
 * Adds one pin to each destination whose cooldown has run down. A destination already holding
 * OVERFLOW_PIN_LIMIT pins with no car on the way gets no more: the request starts its overflow pin.
 */
export function generateDemand(state: SimState): void {
  for (const b of state.buildings) {
    if (b.kind !== 'destination' || !isOpenTile(state, b.tile)) continue;
    const demand = state.demand[b.id];
    if (!demand) continue;
    demand.cooldown = Math.max(0, demand.cooldown - 1);
    if (demand.cooldown > 0) continue;
    demand.cooldown = cooldownFor(demand, b.shape);
    // Only pins still waiting for a car count toward the limit: a pin with a car on its way is
    // being met, so houses keep sending until they run out of cars.
    if (unclaimedPins(state, b.id) < tuning.OVERFLOW_PIN_LIMIT) {
      demand.pins += 1;
      emitEvent({ kind: 'pin-appeared', destination: b.id });
    } else {
      startOverflow(demand, b.id, b.shape);
    }
  }
}

/** How much a destination's overflow pin fills each tick: full in OVERFLOW_FILL_PINS request intervals. */
function fillPerTick(
  demand: Demand,
  shape: 'square' | 'round' | undefined,
): number {
  return (
    1 / (Math.max(1, tuning.OVERFLOW_FILL_PINS) * cooldownFor(demand, shape))
  );
}

/** Starts a destination's overflow pin filling, unless it already is. */
function startOverflow(
  demand: Demand,
  destination: number,
  shape: 'square' | 'round' | undefined,
): void {
  if ((demand.overflowFill ?? 0) > 0) return;
  demand.overflowFill = fillPerTick(demand, shape);
  emitEvent({ kind: 'overflow-started', destination });
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

/**
 * Serves one request at a destination, as a car arrives there. While its overflow pin is filling, the car
 * drains one OVERFLOW_FILL_PINS-th of the fill and the pins stay; otherwise it uses up one pin.
 */
export function servePin(state: SimState, destination: number): void {
  const demand = state.demand[destination];
  if (!demand) return;
  const fill = demand.overflowFill ?? 0;
  if (fill > 0) {
    const left = fill - 1 / Math.max(1, tuning.OVERFLOW_FILL_PINS);
    demand.overflowFill = left > 1e-9 ? left : 0;
    return;
  }
  if (demand.pins === 0) return;
  demand.pins -= 1;
}

/**
 * Adds a pin at a destination straight away. For the debug panel: it lets a tester push a
 * destination towards overflow without waiting. Returns false if there is no destination there.
 */
export function addDemandPin(state: SimState, destination: number): boolean {
  const demand = state.demand[destination];
  if (!demand) return false;
  if (unclaimedPins(state, destination) < tuning.OVERFLOW_PIN_LIMIT) {
    demand.pins += 1;
  } else
    startOverflow(demand, destination, state.buildings[destination]?.shape);
  return true;
}

/** Fills each overflowing destination's pin, one tick's worth. Ends the game when one is full. */
export function updateOverflow(state: SimState): void {
  for (const b of state.buildings) {
    if (b.kind !== 'destination' || !isOpenTile(state, b.tile)) continue;
    const demand = state.demand[b.id];
    if (!demand) continue;
    const fill = demand.overflowFill ?? 0;
    if (fill <= 0) continue;
    const rate = fillPerTick(demand, b.shape);
    const now = Math.min(1, fill + rate);
    demand.overflowFill = now >= 1 - 1e-9 ? 1 : now;
    // Once a second while the pin fills, so the sound can tick without a call every tick.
    if (state.tick % tuning.TICKS_PER_SECOND === 0) {
      emitEvent({
        kind: 'overflow-countdown',
        destination: b.id,
        ticksLeft: Math.ceil((1 - demand.overflowFill) / rate),
      });
    }
    if (demand.overflowFill >= 1 && state.over === null) {
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
