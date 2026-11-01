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
    schemaVersion: 1,
    id: 'test',
    name: 'Test',
    region: { bbox: [-100, 30, -99, 31], rotationDeg: 0 },
    grid: { cols: 20, rows: 20, districts: [] },
    layers: {
      water: [lake],
      mountains: [],
      parks: [],
      spawnZones: [],
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
