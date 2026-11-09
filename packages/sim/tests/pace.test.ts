import { afterEach, describe, expect, it } from 'vitest';
import {
  arrivalsInWeek,
  arriveBusinesses,
  createSim,
  DEFAULT_TUNING,
  defaultPace,
  fenceSteps,
  fenceStepsOf,
  type MapRule,
  paceOf,
  placeBuilding,
  resetTuning,
  tuning,
  type SimState,
} from '../src/index.ts';
import { at, makeGrid } from './helpers.ts';

afterEach(() => resetTuning());

function simWith(rules: MapRule[], week = 1): SimState {
  const sim = createSim({ seed: 5, grid: makeGrid(24, 24), rules });
  sim.tick = (week - 1) * tuning.WEEK_TICKS;
  return sim;
}

describe('map pace', () => {
  it('uses the game defaults when a map sets no pace', () => {
    expect(paceOf([])).toEqual(defaultPace());
    expect(defaultPace().demandPace).toBe(1);
    expect(DEFAULT_TUNING.ROAD_BUDGET_START).toBe(30);
  });

  it('keeps each setting inside its range, rounding the counted ones', () => {
    const pace = paceOf([
      { kind: 'pace', colours: 9, demandPace: 10, arrivalsPerWeek: 1.6 },
    ]);
    expect(pace.colours).toBe(tuning.BUILDING_COLOR_COUNT);
    expect(pace.demandPace).toBe(4);
    expect(pace.arrivalsPerWeek).toBe(2);
    expect(pace.startRoads).toBe(tuning.ROAD_BUDGET_START);
  });

  it('starts a run with the map’s road tiles, unless the caller gives a budget', () => {
    expect(simWith([]).budget).toBe(30);
    expect(simWith([{ kind: 'pace', startRoads: 75 }]).budget).toBe(75);
    const given = createSim({
      seed: 1,
      grid: makeGrid(4, 4),
      roadBudget: 9,
      rules: [{ kind: 'pace', startRoads: 75 }],
    });
    expect(given.budget).toBe(9);
  });

  it('grows the fence at the map’s steps a week', () => {
    const tick = 3 * tuning.WEEK_TICKS;
    const fast = simWith([{ kind: 'pace', fenceStepsPerWeek: 2 }]);
    const still = simWith([{ kind: 'pace', fenceStepsPerWeek: 0 }]);
    expect(fenceStepsOf(simWith([]), tick)).toBe(fenceSteps(tick));
    expect(fenceStepsOf(fast, tick)).toBe(fenceSteps(tick, 2));
    expect(fenceStepsOf(fast, tick)).toBeGreaterThan(fenceSteps(tick));
    expect(fenceStepsOf(still, tick)).toBe(0);
  });

  it('starts business arrivals in the map’s week, at its count a week', () => {
    const rules: MapRule[] = [
      { kind: 'pace', arrivalStartWeek: 5, arrivalsPerWeek: 2 },
    ];
    expect(arriveBusinesses(simWith(rules, 4))).toBe(0);
    expect(arriveBusinesses(simWith(rules, 5))).toBe(2);
    expect(arrivalsInWeek(3, 2)).toBe(2);
  });

  it('brings only the map’s colours', () => {
    const sim = simWith([{ kind: 'pace', colours: 1, arrivalsPerWeek: 3 }], 3);
    expect(arriveBusinesses(sim)).toBeGreaterThan(0);
    expect(sim.buildings.length).toBeGreaterThan(0);
    for (const b of sim.buildings) expect(b.color).toBe(0);
  });

  it('draws a business’s first pin sooner at a faster demand pace', () => {
    const place = (rules: MapRule[]): number => {
      const sim = simWith(rules);
      const r = placeBuilding(sim, {
        kind: 'destination',
        color: 0,
        tile: at(sim.grid, 8, 8),
        entrance: 'n',
        shape: 'square',
      });
      if (!r.ok) throw new Error(r.reason);
      return sim.demand[r.id]?.cooldown ?? -1;
    };
    const normal = place([]);
    expect(normal).toBe(tuning.DEMAND_INTERVAL_SQUARE_TICKS);
    expect(place([{ kind: 'pace', demandPace: 2 }])).toBe(
      Math.round(normal / 2),
    );
  });
});
