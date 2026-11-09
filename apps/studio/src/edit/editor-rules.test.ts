import { describe, expect, it } from 'vitest';
import { parseSourceMap, type SourceMap } from '@overpass-game/map-schema';
import { Editor } from './editor.ts';

function makeMap(): SourceMap {
  return parseSourceMap({
    schemaVersion: 2,
    id: 'test',
    name: 'Test',
    region: { bbox: [-100, 30, -99, 31], rotationDeg: 0 },
    grid: { cols: 40, rows: 30, fence: { col: 8, row: 8, cols: 24, rows: 14 } },
    layers: {
      water: [],
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

describe('the Studio editor: rules', () => {
  it('moves the fence with the fence tool, as one undo step', () => {
    const editor = new Editor(makeMap());
    editor.setTool('fence');
    const grip = editor.pickFence({ x: 20, y: 15 }, 0.5);
    expect(grip).toBe('move');
    editor.beginFenceDrag('move', { x: 20, y: 15 });
    editor.dragTo({ x: 21, y: 15 });
    editor.dragTo({ x: 23, y: 16 });
    editor.endDrag();
    expect(editor.map.grid.fence).toEqual({
      col: 11,
      row: 9,
      cols: 24,
      rows: 14,
    });
    editor.undo();
    expect(editor.map.grid.fence).toEqual({
      col: 8,
      row: 8,
      cols: 24,
      rows: 14,
    });
  });

  it('resizes the fence from a corner, and the result still parses', () => {
    const editor = new Editor(makeMap());
    expect(editor.pickFence({ x: 32, y: 22 }, 0.5)).toBe('se');
    editor.beginFenceDrag('se', { x: 32, y: 22 });
    editor.dragTo({ x: 36, y: 26 });
    editor.endDrag();
    expect(editor.map.grid.fence).toEqual({
      col: 8,
      row: 8,
      cols: 28,
      rows: 18,
    });
    expect(() => parseSourceMap(editor.map)).not.toThrow();
  });

  it('does not paint while the fence tool is on', () => {
    const editor = new Editor(makeMap());
    editor.setTool('fence');
    editor.addPaintPoint({ x: 3, y: 3 });
    expect(editor.pendingPoints).toHaveLength(0);
    expect(editor.closesOnFirst).toBe(false);
  });

  it('sets typed fence values and pace settings, each undoable, and the map still parses', () => {
    const editor = new Editor(makeMap());
    editor.setFence({ col: 0, row: 0, cols: 99, rows: 10 });
    expect(editor.map.grid.fence).toEqual({
      col: 0,
      row: 0,
      cols: 40,
      rows: 10,
    });
    editor.centreFence();
    expect(editor.map.grid.fence).toEqual({
      col: 0,
      row: 10,
      cols: 40,
      rows: 10,
    });
    editor.setPace('colours', 2);
    editor.setPace('demandPace', 1.5);
    expect(editor.map.rules).toEqual([
      { kind: 'pace', colours: 2, demandPace: 1.5 },
    ]);
    expect(() => parseSourceMap(editor.map)).not.toThrow();
    editor.undo();
    expect(editor.map.rules).toEqual([{ kind: 'pace', colours: 2 }]);
    editor.clearPace();
    expect(editor.map.rules).toEqual([]);
  });
});
