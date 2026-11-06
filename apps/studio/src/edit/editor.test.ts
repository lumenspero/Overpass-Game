import { describe, expect, it } from 'vitest';
import {
  parseSourceMap,
  type Shape,
  type SourceMap,
} from '@overpass-game/map-schema';
import { Editor } from './editor.ts';

const lake: Shape = {
  id: 'lake',
  kind: 'closedSpline',
  origin: 'painted',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
};

function makeMap(): SourceMap {
  return parseSourceMap({
    schemaVersion: 2,
    id: 'test',
    name: 'Test',
    region: { bbox: [-100, 30, -99, 31], rotationDeg: 0 },
    grid: { cols: 20, rows: 20, fence: { col: 0, row: 0, cols: 20, rows: 20 } },
    layers: {
      water: [lake],
      mountains: [],
      parks: [],
      motorwayGuide: [],
      starterRoads: [],
    },
    rules: [],
    palette: 'default',
    attribution: '© test',
  });
}

const lakeOf = (m: SourceMap) => m.layers.water[0]!;

describe('Editor drags', () => {
  it('moves a point snapped to the grid, as one undo step', () => {
    const editor = new Editor(makeMap());
    // Grab anchor 1 at (10, 0) with the pointer 0.1 tiles away; the anchor keeps that offset.
    editor.beginDrag(
      { kind: 'point', layer: 'water', id: 'lake', index: 1 },
      { x: 10.1, y: 0.1 },
    );
    editor.dragTo({ x: 12.3, y: 0.1 });
    // Target is (12.2, 0.0), which snaps to (12.25, 0).
    expect(lakeOf(editor.map).points[1]).toMatchObject({ x: 12.25, y: 0 });
    expect(editor.undoable).toBe(false);
    editor.endDrag();
    expect(editor.undoable).toBe(true);
    editor.undo();
    expect(lakeOf(editor.map).points[1]).toMatchObject({ x: 10, y: 0 });
  });

  it('moves a whole shape by a snapped offset', () => {
    const editor = new Editor(makeMap());
    editor.beginDrag(
      { kind: 'body', layer: 'water', id: 'lake' },
      { x: 5, y: 5 },
    );
    // dx = 1.1 snaps to 1.0; dy = 0.2 snaps to 0.25.
    editor.dragTo({ x: 6.1, y: 5.2 });
    editor.endDrag();
    expect(lakeOf(editor.map).points[0]).toMatchObject({ x: 1, y: 0.25 });
  });

  it('cancelling a drag restores the map and leaves no undo step', () => {
    const editor = new Editor(makeMap());
    const before = editor.map;
    editor.beginDrag(
      { kind: 'body', layer: 'water', id: 'lake' },
      { x: 5, y: 5 },
    );
    editor.dragTo({ x: 9, y: 9 });
    editor.cancelDrag();
    expect(editor.map).toBe(before);
    expect(editor.undoable).toBe(false);
  });

  it('a drag that changes nothing leaves no undo step', () => {
    const editor = new Editor(makeMap());
    editor.beginDrag(
      { kind: 'body', layer: 'water', id: 'lake' },
      { x: 5, y: 5 },
    );
    editor.dragTo({ x: 5.05, y: 5.05 });
    editor.endDrag();
    expect(editor.undoable).toBe(false);
  });

  it('notifies listeners as the drag changes the map', () => {
    const editor = new Editor(makeMap());
    let calls = 0;
    const off = editor.subscribe(() => {
      calls++;
    });
    editor.beginDrag(
      { kind: 'body', layer: 'water', id: 'lake' },
      { x: 5, y: 5 },
    );
    editor.dragTo({ x: 6, y: 5 });
    off();
    editor.dragTo({ x: 7, y: 5 });
    expect(calls).toBe(2);
  });
});

describe('Editor painting', () => {
  const p = (x: number, y: number) => ({ x, y });

  it('a point click adds a snapped point while a paint tool is active', () => {
    const editor = new Editor(makeMap());
    editor.setTool('lake');
    editor.addPaintPoint(p(1.1, 2.2));
    expect(editor.pendingPoints).toEqual([p(1.0, 2.25)]);
  });

  it('ignores clicks in the select tool', () => {
    const editor = new Editor(makeMap());
    editor.addPaintPoint(p(1, 1));
    expect(editor.pendingPoints).toHaveLength(0);
  });

  it('finishing makes one selected shape and is one undo step', () => {
    const editor = new Editor(makeMap());
    editor.setTool('mountain');
    editor.addPaintPoint(p(2, 2));
    editor.addPaintPoint(p(6, 2));
    editor.addPaintPoint(p(6, 6));
    editor.finishPaint();
    expect(editor.map.layers.mountains).toHaveLength(1);
    expect(editor.selection).toEqual({
      layer: 'mountains',
      id: 'mountain-1',
      index: null,
    });
    expect(editor.pendingPoints).toHaveLength(0);
    editor.undo();
    expect(editor.map.layers.mountains).toHaveLength(0);
  });

  it('too few points finish to nothing and leave no step', () => {
    const editor = new Editor(makeMap());
    editor.setTool('lake');
    editor.addPaintPoint(p(2, 2));
    editor.addPaintPoint(p(6, 2));
    editor.finishPaint();
    expect(editor.map.layers.water).toHaveLength(1);
    expect(editor.pendingPoints).toHaveLength(0);
    // Only the undo of the pending points is available, not a map step.
    expect(editor.undoable).toBe(false);
  });

  it('undo removes the last pending point before any map step', () => {
    const editor = new Editor(makeMap());
    editor.setTool('park');
    editor.addPaintPoint(p(2, 2));
    editor.addPaintPoint(p(6, 2));
    editor.undo();
    expect(editor.pendingPoints).toHaveLength(1);
    expect(editor.map.layers.water).toHaveLength(1);
  });

  it('switching tool drops pending points', () => {
    const editor = new Editor(makeMap());
    editor.setTool('road');
    editor.addPaintPoint(p(2, 2));
    editor.setTool('guide');
    expect(editor.pendingPoints).toHaveLength(0);
  });

  it('makes a river with the chosen width', () => {
    const editor = new Editor(makeMap());
    editor.setTool('river');
    editor.setRiverWidth(0.6);
    editor.addPaintPoint(p(2, 2));
    editor.addPaintPoint(p(8, 2));
    editor.finishPaint();
    const river = editor.map.layers.water.find((w) => w.id === 'river-1');
    expect(river).toMatchObject({ kind: 'strokeSpline', width: 0.6 });
  });
});

describe('Editor edits', () => {
  it('inserts a point on an edge and selects it', () => {
    const editor = new Editor(makeMap());
    editor.insertOnSegment('water', 'lake', 1);
    expect(lakeOf(editor.map).points).toHaveLength(5);
    expect(editor.selection).toEqual({ layer: 'water', id: 'lake', index: 2 });
    editor.undo();
    expect(lakeOf(editor.map).points).toHaveLength(4);
  });

  it('deletes the selected point, and undo brings it back', () => {
    const editor = new Editor(makeMap());
    editor.select({ layer: 'water', id: 'lake', index: 2 });
    editor.deleteSelectedPoint();
    expect(lakeOf(editor.map).points).toHaveLength(3);
    editor.undo();
    expect(lakeOf(editor.map).points).toHaveLength(4);
  });

  it('does nothing to delete without a selected point', () => {
    const editor = new Editor(makeMap());
    editor.select({ layer: 'water', id: 'lake', index: null });
    editor.deleteSelectedPoint();
    expect(editor.undoable).toBe(false);
  });

  it('turns the selected shape about its centre', () => {
    const editor = new Editor(makeMap());
    editor.select({ layer: 'water', id: 'lake', index: null });
    editor.rotateSelected(90);
    // Centre (5, 5): the corner (0, 0) turns to (10, 0).
    expect(lakeOf(editor.map).points[0]!.x).toBeCloseTo(10, 9);
    expect(lakeOf(editor.map).points[0]!.y).toBeCloseTo(0, 9);
  });

  it('scales the selected shape about its centre', () => {
    const editor = new Editor(makeMap());
    editor.select({ layer: 'water', id: 'lake', index: null });
    editor.scaleSelected(2);
    expect(lakeOf(editor.map).points[0]).toMatchObject({ x: -5, y: -5 });
  });

  it('transforms nothing without a selection', () => {
    const editor = new Editor(makeMap());
    editor.rotateSelected(15);
    editor.scaleSelected(2);
    expect(editor.undoable).toBe(false);
  });

  it('clears a point selection that no longer exists after undo', () => {
    const editor = new Editor(makeMap());
    editor.insertOnSegment('water', 'lake', 0);
    expect(editor.selection?.index).toBe(1);
    editor.select({ layer: 'water', id: 'lake', index: 4 });
    editor.undo();
    expect(lakeOf(editor.map).points).toHaveLength(4);
    expect(editor.selection).toEqual({
      layer: 'water',
      id: 'lake',
      index: null,
    });
  });

  it('loading a new map clears history and selection', () => {
    const editor = new Editor(makeMap());
    editor.insertOnSegment('water', 'lake', 0);
    editor.load(makeMap());
    expect(editor.undoable).toBe(false);
    expect(editor.selection).toBeNull();
  });
});

describe('Editor paint point removal', () => {
  it('removes only the last pending point, never a finished shape', () => {
    const editor = new Editor(makeMap());
    editor.setTool('park');
    editor.addPaintPoint({ x: 2, y: 2 });
    editor.removePaintPoint();
    editor.removePaintPoint();
    expect(editor.pendingPoints).toHaveLength(0);
    expect(editor.map.layers.water).toHaveLength(1);
  });
});

describe('Editor layers, snapping and multi-select', () => {
  const pond: Shape = {
    id: 'pond',
    kind: 'closedSpline',
    origin: 'painted',
    points: [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 20, y: 10 },
    ],
  };
  function twoLakes(): SourceMap {
    const base = makeMap();
    return { ...base, layers: { ...base.layers, water: [lake, pond] } };
  }
  const waterIds = (m: SourceMap) => m.layers.water.map((w) => w.id);

  it('hiding a layer empties it in display only', () => {
    const editor = new Editor(makeMap());
    editor.toggleLayerVisible('water');
    expect(editor.display.layers.water).toHaveLength(0);
    expect(editor.map.layers.water).toHaveLength(1);
    editor.toggleLayerVisible('water');
    expect(editor.display).toBe(editor.map);
  });

  it('a locked layer cannot be picked, but still displays', () => {
    const editor = new Editor(makeMap());
    editor.toggleLayerLocked('water');
    expect(editor.pick({ x: 0.1, y: 0.1 }, 0.5)).toBeNull();
    expect(editor.display.layers.water).toHaveLength(1);
    editor.toggleLayerLocked('water');
    expect(editor.pick({ x: 0.1, y: 0.1 }, 0.5)).not.toBeNull();
  });

  it('hiding a layer drops its shapes from the selection', () => {
    const editor = new Editor(twoLakes());
    editor.toggleShape({ layer: 'water', id: 'lake' });
    editor.toggleShape({ layer: 'water', id: 'pond' });
    editor.toggleLayerVisible('water');
    expect(editor.selectedShapes).toEqual([]);
  });

  it('with snapping off, a drag lands exactly on the pointer', () => {
    const editor = new Editor(makeMap());
    editor.setSnapping(false);
    editor.beginDrag(
      { kind: 'point', layer: 'water', id: 'lake', index: 1 },
      { x: 10.1, y: 0.1 },
    );
    editor.dragTo({ x: 12.3, y: 0.1 });
    editor.endDrag();
    expect(lakeOf(editor.map).points[1]!.x).toBeCloseTo(12.2, 9);
  });

  it('shift-click builds a selection that moves together', () => {
    const editor = new Editor(twoLakes());
    editor.toggleShape({ layer: 'water', id: 'lake' });
    editor.toggleShape({ layer: 'water', id: 'pond' });
    expect(editor.selectedShapes).toHaveLength(2);
    editor.beginDrag(
      { kind: 'body', layer: 'water', id: 'lake' },
      { x: 5, y: 5 },
    );
    editor.dragTo({ x: 6, y: 5 });
    editor.endDrag();
    expect(waterIds(editor.map)).toEqual(['lake', 'pond']);
    expect(editor.map.layers.water[0]!.points[0]!.x).toBe(1);
    expect(editor.map.layers.water[1]!.points[0]!.x).toBe(21);
    editor.undo();
    expect(editor.map.layers.water[1]!.points[0]!.x).toBe(20);
  });

  it('shift-click removes a shape that is already selected', () => {
    const editor = new Editor(twoLakes());
    editor.toggleShape({ layer: 'water', id: 'lake' });
    editor.toggleShape({ layer: 'water', id: 'pond' });
    editor.toggleShape({ layer: 'water', id: 'lake' });
    expect(editor.selectedShapes).toEqual([{ layer: 'water', id: 'pond' }]);
  });

  it('grabbing an unselected shape selects it alone', () => {
    const editor = new Editor(twoLakes());
    editor.toggleShape({ layer: 'water', id: 'lake' });
    editor.beginDrag(
      { kind: 'body', layer: 'water', id: 'pond' },
      { x: 25, y: 5 },
    );
    editor.endDrag();
    expect(editor.selectedShapes).toEqual([{ layer: 'water', id: 'pond' }]);
  });

  it('deletes the selected shapes as one step, and undo restores them', () => {
    const editor = new Editor(twoLakes());
    editor.toggleShape({ layer: 'water', id: 'lake' });
    editor.toggleShape({ layer: 'water', id: 'pond' });
    editor.deleteSelectedShapes();
    expect(editor.map.layers.water).toHaveLength(0);
    expect(editor.selectedShapes).toEqual([]);
    editor.undo();
    expect(waterIds(editor.map)).toEqual(['lake', 'pond']);
  });

  it('a locked shape cannot move or be deleted, and locking is undoable', () => {
    const editor = new Editor(twoLakes());
    editor.select({ layer: 'water', id: 'lake', index: null });
    editor.setShapesLocked(true);
    expect(editor.map.layers.water[0]!.locked).toBe(true);
    editor.beginDrag(
      { kind: 'body', layer: 'water', id: 'lake' },
      { x: 5, y: 5 },
    );
    editor.dragTo({ x: 9, y: 5 });
    editor.endDrag();
    expect(editor.map.layers.water[0]!.points[0]!.x).toBe(0);
    editor.deleteSelectedShapes();
    expect(waterIds(editor.map)).toEqual(['lake', 'pond']);
    editor.undo();
    expect(editor.map.layers.water[0]!.locked).toBeUndefined();
  });

  it('turns a multi-selection about its group centre', () => {
    const editor = new Editor(twoLakes());
    editor.toggleShape({ layer: 'water', id: 'lake' });
    editor.toggleShape({ layer: 'water', id: 'pond' });
    // Group bounds run from x 0 to 30 and y 0 to 10, so the centre is (15, 5).
    editor.rotateSelected(180);
    // The lake's corner (0, 0) turns about (15, 5) to (30, 10).
    expect(editor.map.layers.water[0]!.points[0]!.x).toBeCloseTo(30, 9);
    expect(editor.map.layers.water[0]!.points[0]!.y).toBeCloseTo(10, 9);
  });
});

describe('Editor box and length selection', () => {
  const river: Shape = {
    id: 'river',
    kind: 'strokeSpline',
    origin: 'painted',
    width: 0.3,
    points: [
      { x: 30, y: 0 },
      { x: 31, y: 0 },
    ],
  };
  function lakeAndRiver(): SourceMap {
    const base = makeMap();
    return { ...base, layers: { ...base.layers, water: [lake, river] } };
  }

  it('box select takes only shapes fully inside', () => {
    const editor = new Editor(lakeAndRiver());
    editor.selectInRect({ x0: -1, y0: -1, x1: 11, y1: 11 }, false);
    expect(editor.selectedShapes).toEqual([{ layer: 'water', id: 'lake' }]);
  });

  it('shift box select adds to the selection', () => {
    const editor = new Editor(lakeAndRiver());
    editor.selectInRect({ x0: -1, y0: -1, x1: 11, y1: 11 }, false);
    editor.selectInRect({ x0: 29, y0: -1, x1: 32, y1: 1 }, true);
    expect(editor.selectedShapes).toHaveLength(2);
  });

  it('selects shapes shorter than a length, and counts them', () => {
    const editor = new Editor(lakeAndRiver());
    // The lake has a perimeter of 40 tiles, the river a length of 1.
    expect(editor.shortCount(5)).toBe(1);
    editor.selectShorterThan(5);
    expect(editor.selectedShapes).toEqual([{ layer: 'water', id: 'river' }]);
  });

  it('hidden layers are left out of box and length selection', () => {
    const editor = new Editor(lakeAndRiver());
    editor.toggleLayerVisible('water');
    expect(editor.shortCount(5)).toBe(0);
    editor.selectInRect({ x0: -1, y0: -1, x1: 40, y1: 40 }, false);
    expect(editor.selectedShapes).toEqual([]);
  });
});
