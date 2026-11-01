import type { MapLabel, SourceMap } from '@overpass-game/map-schema';
import type { Pt } from './hit.ts';

/** Label text sizes in grid tiles: the schema allows up to 10. New labels start at 0.5 tiles. */
export const LABEL_SIZE = { min: 0.5, max: 10, default: 0.5 } as const;

/** The text a new label gets, by kind. The author can edit it straight away. */
export const LABEL_DEFAULT_TEXT: Record<MapLabel['kind'], string> = {
  park: 'Park',
  mountain: 'Mountain',
  water: 'Water',
};

export interface LabelBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/**
 * The rough box a label's text covers, in grid units, centred on the label's position. Width
 * assumes an average character is about 0.6 of the size. It is used for picking and for the
 * selection frame, so both agree even though the drawn glyphs may differ slightly.
 */
export function labelBox(label: MapLabel): LabelBox {
  const w = Math.max(label.size, label.text.length * label.size * 0.6);
  const h = label.size * 1.2;
  return {
    x0: label.x - w / 2,
    x1: label.x + w / 2,
    y0: label.y - h / 2,
    y1: label.y + h / 2,
  };
}

/** Which part of a label a press landed on: its body moves it, its corner resizes it. */
export type LabelGrip = 'move' | 'resize';

/**
 * Picks the label under a point. Corners are checked before bodies, so a corner of one label
 * is never hidden by the body of another. Later labels are on top, so they are checked first.
 */
export function pickLabel(
  map: SourceMap,
  at: Pt,
  tol: number,
): { id: string; grip: LabelGrip } | null {
  const labels = map.layers.labels;
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i]!;
    const b = labelBox(label);
    if (Math.hypot(at.x - b.x1, at.y - b.y1) <= tol) {
      return { id: label.id, grip: 'resize' };
    }
  }
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i]!;
    const b = labelBox(label);
    if (
      at.x >= b.x0 - tol &&
      at.x <= b.x1 + tol &&
      at.y >= b.y0 - tol &&
      at.y <= b.y1 + tol
    ) {
      return { id: label.id, grip: 'move' };
    }
  }
  return null;
}
