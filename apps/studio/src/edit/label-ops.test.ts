import { describe, expect, it } from 'vitest';
import {
  parseSourceMap,
  type MapLabel,
  type SourceMap,
} from '@overpass-game/map-schema';
import {
  addLabel,
  removeLabel,
  setLabel,
  setPalette,
  moveLabel,
} from './ops.ts';
import { labelBox, pickLabel } from './labels.ts';

function makeMap(labels: MapLabel[] = []): SourceMap {
  return parseSourceMap({
    schemaVersion: 2,
    id: 'test',
    name: 'Test',
    region: { bbox: [-100, 30, -99, 31], rotationDeg: 0 },
    grid: { cols: 20, rows: 20, fence: { col: 0, row: 0, cols: 20, rows: 20 } },
    layers: {
      water: [],
      mountains: [],
      parks: [],
      motorwayGuide: [],
      starterRoads: [],
      labels,
    },
    rules: [],
    palette: 'default',
    attribution: '© test',
  });
}

const park: MapLabel = {
  id: 'label-1',
  kind: 'park',
  text: 'Park',
  x: 10,
  y: 10,
  size: 1,
};

describe('label ops', () => {
  it('adds a label and refuses an id already in use', () => {
    const m = addLabel(makeMap(), park);
    expect(m.layers.labels).toEqual([park]);
    expect(addLabel(m, park)).toBe(m);
  });

  it('moves a label and returns the same map when it does not move', () => {
    const m = makeMap([park]);
    const moved = moveLabel(m, 'label-1', 12, 8);
    expect(moved.layers.labels[0]).toMatchObject({ x: 12, y: 8 });
    expect(moveLabel(m, 'label-1', 10, 10)).toBe(m);
    expect(moveLabel(m, 'missing', 1, 1)).toBe(m);
  });

  it('trims text, clamps size, and refuses blank text', () => {
    const m = makeMap([park]);
    const edited = setLabel(m, 'label-1', { text: '  Hyde Park  ', size: 99 });
    expect(edited.layers.labels[0]).toMatchObject({
      text: 'Hyde Park',
      size: 20,
    });
    expect(setLabel(m, 'label-1', { text: '   ' })).toBe(m);
    expect(setLabel(m, 'label-1', { size: Number.NaN })).toBe(m);
  });

  it('changes kind and removes a label', () => {
    const m = makeMap([park]);
    expect(
      setLabel(m, 'label-1', { kind: 'water' }).layers.labels[0]!.kind,
    ).toBe('water');
    expect(removeLabel(m, 'label-1').layers.labels).toEqual([]);
    expect(removeLabel(m, 'missing')).toBe(m);
  });

  it('sets the palette family and returns the same map when unchanged', () => {
    const m = makeMap();
    expect(setPalette(m, 'indigo').palette).toBe('indigo');
    expect(setPalette(m, 'default')).toBe(m);
  });
});

describe('label picking', () => {
  it('finds a label body and its bottom-right corner', () => {
    const m = makeMap([park]);
    const box = labelBox(park);
    expect(pickLabel(m, { x: 10, y: 10 }, 0.1)).toEqual({
      id: 'label-1',
      grip: 'move',
    });
    expect(pickLabel(m, { x: box.x1, y: box.y1 }, 0.1)).toEqual({
      id: 'label-1',
      grip: 'resize',
    });
    expect(pickLabel(m, { x: 0, y: 0 }, 0.1)).toBeNull();
  });
});

describe('label colour override', () => {
  const label: MapLabel = {
    id: 'l1',
    kind: 'park',
    text: 'LaFramboise Island',
    x: 4,
    y: 5,
    size: 1,
  };

  it('draws a label in another stored colour, and returns it to its own', () => {
    const set = setLabel(makeMap([label]), 'l1', { colour: 'water' });
    expect(set.layers.labels[0]?.colour).toBe('water');
    expect(set.layers.labels[0]?.kind).toBe('park');
    const cleared = setLabel(set, 'l1', { colour: null });
    expect(cleared.layers.labels[0]).not.toHaveProperty('colour');
  });

  it('leaves the map alone when the colour does not change', () => {
    const map = makeMap([label]);
    expect(setLabel(map, 'l1', { colour: null })).toBe(map);
  });
});
