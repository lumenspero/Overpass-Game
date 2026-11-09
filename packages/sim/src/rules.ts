import { DEFAULT_TUNING, tuning } from './config.ts';
import type { SimState } from './sim.ts';
import { OFFER_IDS, type OfferId } from './upgrades.ts';

/**
 * Per-map rules (spec: Destination growth and rule hooks). A map passes its rules to
 * the sim as data, so it can change without code changes. `allowedOffers` leaves out offer options
 * the map does not want. Colours are not a map rule: they arrive with businesses (spec: Business
 * arrival and house supply).
 */

/** The offer options a map can leave out. Road tiles are always on offer, so they are not listed. */
export const RESTRICTABLE_OFFERS = [
  'motorway',
  'bridge',
  'roundabout',
  'tunnel',
  'lights',
] as const;

export type RestrictableOffer = (typeof RESTRICTABLE_OFFERS)[number];

/**
 * A map's pace: optional overrides of a few game-wide numbers, set per map in the Studio's Rules
 * section. A setting left out uses the game's default, so a map without the rule plays as before.
 */
export interface PaceRule {
  kind: 'pace';
  /** Business colours in play, counted from the first. */
  colours?: number;
  /** Fence growth steps a week. */
  fenceStepsPerWeek?: number;
  /** The week businesses start to arrive. */
  arrivalStartWeek?: number;
  /** Businesses that arrive each week, before the bonus weeks. */
  arrivalsPerWeek?: number;
  /** Demand speed: 2 draws pins twice as often, 0.5 half as often. */
  demandPace?: number;
  /** Road tiles the run starts with. */
  startRoads?: number;
}

export type PaceKey = Exclude<keyof PaceRule, 'kind'>;

export const PACE_KEYS = [
  'colours',
  'fenceStepsPerWeek',
  'arrivalStartWeek',
  'arrivalsPerWeek',
  'demandPace',
  'startRoads',
] as const satisfies readonly PaceKey[];

/** The range each pace setting may take. Values outside it are clamped when a run reads them. */
export const PACE_LIMITS: Readonly<
  Record<PaceKey, { min: number; max: number; integer: boolean }>
> = {
  colours: { min: 1, max: DEFAULT_TUNING.BUILDING_COLOR_COUNT, integer: true },
  fenceStepsPerWeek: { min: 0, max: 6, integer: true },
  arrivalStartWeek: { min: 1, max: 30, integer: true },
  arrivalsPerWeek: { min: 0, max: 4, integer: true },
  demandPace: { min: 0.25, max: 4, integer: false },
  startRoads: { min: 0, max: 500, integer: true },
};

export type Pace = Record<PaceKey, number>;

/** The game's own value for each pace setting. Read from `tuning` each call, so the debug panel applies. */
export function defaultPace(): Pace {
  return {
    colours: tuning.BUILDING_COLOR_COUNT,
    fenceStepsPerWeek: tuning.FENCE_STEPS_PER_WEEK,
    arrivalStartWeek: tuning.BUSINESS_ARRIVAL_START_WEEK,
    arrivalsPerWeek: tuning.BUSINESS_ARRIVALS_PER_WEEK,
    demandPace: 1,
    startRoads: tuning.ROAD_BUDGET_START,
  };
}

/** A run's pace: the map's overrides over the defaults, each kept inside its range. */
export function paceOf(rules: readonly MapRule[]): Pace {
  const out = defaultPace();
  const rule = rules.find((r): r is PaceRule => r.kind === 'pace');
  if (rule) {
    for (const key of PACE_KEYS) {
      const value = rule[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const { min, max, integer } = PACE_LIMITS[key];
      out[key] = Math.min(
        max,
        Math.max(min, integer ? Math.round(value) : value),
      );
    }
  }
  // Colours can't pass the game's own count, which buildings are checked against.
  out.colours = Math.min(out.colours, tuning.BUILDING_COLOR_COUNT);
  return out;
}

export type MapRule =
  | { kind: 'allowedOffers'; options: RestrictableOffer[] }
  | PaceRule
  // Sim only, not in the map format: no businesses arrive and no houses are topped up. For scripted
  // demos, which bring their own buildings.
  | { kind: 'noSpawns' };

/** Whether the run's rules turn off business arrivals and house top-ups. */
export function spawnsOff(state: SimState): boolean {
  return state.rules.some((r) => r.kind === 'noSpawns');
}

/**
 * The offers a week may draw from: the map's allowed options, with road tiles always included.
 * A map with no such rule, or with an empty list, allows every offer.
 */
export function offerCandidates(state: SimState): OfferId[] {
  const rule = state.rules.find((r) => r.kind === 'allowedOffers');
  if (!rule || rule.kind !== 'allowedOffers' || rule.options.length === 0) {
    return [...OFFER_IDS];
  }
  const allowed: readonly string[] = rule.options;
  return OFFER_IDS.filter((id) => id === 'tiles' || allowed.includes(id));
}
