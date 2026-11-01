import { parseSourceMap, type SourceMap } from '@overpass-game/map-schema';
import type { Frame } from '../geo/frame.ts';
import type { Metres } from '../geo/mercator.ts';

/** Version of the draft format. Bump it with a migration when the shape changes. */
export const DRAFT_VERSION = 1 as const;

/** Drafts are stored under `draft:<map id>`, so each map has one draft. */
export const DRAFT_PREFIX = 'draft:';

/** Everything needed to pick up an import where it was left. */
export interface Draft {
  readonly version: typeof DRAFT_VERSION;
  readonly savedAt: string;
  readonly placeName: string;
  readonly frame: Frame;
  readonly mountainThreshold: number;
  /** Elevation for the frame, so the mountain slider still works after a restore. */
  readonly elevation: Float32Array | null;
  readonly map: SourceMap;
}

export function draftKey(mapId: string): string {
  return DRAFT_PREFIX + mapId;
}

export function isDraftKey(key: unknown): key is string {
  return typeof key === 'string' && key.startsWith(DRAFT_PREFIX);
}

/** Builds a draft stamped with the current time. */
export function makeDraft(input: Omit<Draft, 'savedAt' | 'version'>): Draft {
  return {
    ...input,
    version: DRAFT_VERSION,
    savedAt: new Date().toISOString(),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

/** Reads a stored lump as a draft. Anything that is not a valid draft of this version reads as null. */
export function readDraft(data: unknown): Draft | null {
  if (!isRecord(data) || data.version !== DRAFT_VERSION) return null;
  const { savedAt, placeName, mountainThreshold, elevation } = data;
  if (
    typeof savedAt !== 'string' ||
    typeof placeName !== 'string' ||
    placeName === ''
  )
    return null;
  if (!isFinite(mountainThreshold)) return null;
  if (elevation !== null && !(elevation instanceof Float32Array)) return null;

  const f = data.frame;
  if (!isRecord(f)) return null;
  const c = f.centre;
  if (!Array.isArray(c) || c.length !== 2 || !isFinite(c[0]) || !isFinite(c[1]))
    return null;
  if (
    !isPositiveInt(f.cols) ||
    !isPositiveInt(f.rows) ||
    !isFinite(f.rotationDeg)
  )
    return null;
  const centre: Metres = [c[0], c[1]];

  try {
    const map = parseSourceMap(data.map);
    return {
      version: DRAFT_VERSION,
      savedAt,
      placeName,
      frame: { centre, cols: f.cols, rows: f.rows, rotationDeg: f.rotationDeg },
      mountainThreshold,
      elevation,
      map,
    };
  } catch {
    return null;
  }
}
