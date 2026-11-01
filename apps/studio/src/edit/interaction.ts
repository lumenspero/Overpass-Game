import { EDIT } from '../config.ts';
import type { Editor } from './editor.ts';
import type { Pt } from './hit.ts';
import { rectFrom, type Rect } from './select.ts';

/** What the interaction needs from the canvas: picking, the view, and the box-select rectangle. */
export interface Surface {
  locate(
    clientX: number,
    clientY: number,
  ): { point: Pt; tilesPerPixel: number } | null;
  zoomAt(clientX: number, clientY: number, factor: number): void;
  panBy(dx: number, dy: number): void;
  setMarquee(rect: Rect | null): void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

/** A press that moves less than this, in tiles, counts as a click rather than a box. */
const CLICK_TILES = 0.25;
/** Arrow keys pan this many screen pixels per press; Shift pans further. */
const ARROW_PAN_PX = 60;
const ARROW_PAN_SHIFT_PX = 240;

/**
 * Pointer and keyboard editing for the preview canvas.
 *
 * Select tool: a press on a handle, anchor or shape grabs it and dragging moves it. Dragging
 * on empty space draws a box that selects the shapes fully inside it; a plain click on empty
 * space clears the selection. Shift adds to the selection: Shift+click on a shape toggles it,
 * and a Shift box adds to what is selected. Double-clicking an edge adds a point there.
 *
 * Paint tools: each click adds a point; a click on the first point of a closed shape closes it,
 * and a double-click finishes any shape.
 *
 * View: the mouse wheel zooms about the pointer. To pan, drag with the middle or right button,
 * or hold Space and drag with the left button. The arrow keys nudge the view (Shift for more).
 *
 * Keyboard: Ctrl/Cmd+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes. Delete or Backspace removes the
 * selected point, or the selected shapes when no point is picked, or the last pending point
 * while painting. Enter finishes a painted shape; Escape cancels it, or clears the selection.
 *
 * Returns a function that removes every listener.
 */
export function attachInteraction(
  canvas: HTMLCanvasElement,
  surface: Surface,
  getEditor: () => Editor | null,
): () => void {
  let dragging = false;
  let panning: Pt | null = null;
  let boxStart: Pt | null = null;
  let boxEnd: Pt | null = null;
  let boxShift = false;
  let spaceHeld = false;
  canvas.style.touchAction = 'none';

  const setCursor = (): void => {
    canvas.style.cursor = panning ? 'grabbing' : spaceHeld ? 'grab' : '';
  };

  const locate = (editor: Editor, e: MouseEvent) => {
    const loc = surface.locate(e.clientX, e.clientY);
    if (!loc) return null;
    const tol = EDIT.hitRadiusPx * loc.tilesPerPixel;
    return { loc, tol, hit: editor.pick(loc.point, tol) };
  };

  const startPan = (e: PointerEvent): void => {
    e.preventDefault();
    panning = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    setCursor();
  };

  const onDown = (e: PointerEvent): void => {
    // Middle and right buttons always pan; Space plus left button pans too.
    if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceHeld)) {
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const editor = getEditor();
    if (!editor) return;
    const found = locate(editor, e);
    if (!found) return;

    if (editor.tool !== 'select') {
      const first = editor.pendingPoints[0];
      const closes =
        editor.closesOnFirst &&
        first !== undefined &&
        editor.pendingPoints.length >= 3 &&
        Math.hypot(first.x - found.loc.point.x, first.y - found.loc.point.y) <=
          found.tol;
      if (closes) editor.finishPaint();
      else editor.addPaintPoint(found.loc.point);
      return;
    }

    if (!found.hit) {
      boxStart = found.loc.point;
      boxEnd = found.loc.point;
      boxShift = e.shiftKey;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (
      e.shiftKey &&
      (found.hit.kind === 'body' || found.hit.kind === 'edge')
    ) {
      editor.toggleShape({ layer: found.hit.layer, id: found.hit.id });
      return;
    }
    editor.beginDrag(found.hit, found.loc.point);
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent): void => {
    if (panning) {
      surface.panBy(e.clientX - panning.x, e.clientY - panning.y);
      panning = { x: e.clientX, y: e.clientY };
      return;
    }
    if (boxStart) {
      const loc = surface.locate(e.clientX, e.clientY);
      if (loc) {
        boxEnd = loc.point;
        surface.setMarquee(rectFrom(boxStart, boxEnd));
      }
      return;
    }
    if (!dragging) return;
    const editor = getEditor();
    const loc = surface.locate(e.clientX, e.clientY);
    if (editor && loc) editor.dragTo(loc.point);
  };

  const onUp = (): void => {
    if (panning) {
      panning = null;
      setCursor();
      return;
    }
    if (boxStart) {
      const start = boxStart;
      const end = boxEnd ?? start;
      const shift = boxShift;
      boxStart = null;
      boxEnd = null;
      surface.setMarquee(null);
      const rect = rectFrom(start, end);
      const editor = getEditor();
      if (!editor) return;
      if (rect.x1 - rect.x0 < CLICK_TILES && rect.y1 - rect.y0 < CLICK_TILES) {
        if (!shift) editor.select(null);
      } else {
        editor.selectInRect(rect, shift);
      }
      return;
    }
    if (!dragging) return;
    dragging = false;
    getEditor()?.endDrag();
  };

  const onCancel = (): void => {
    panning = null;
    setCursor();
    if (boxStart) {
      boxStart = null;
      boxEnd = null;
      surface.setMarquee(null);
    }
    if (!dragging) return;
    dragging = false;
    getEditor()?.cancelDrag();
  };

  const onDblClick = (e: MouseEvent): void => {
    const editor = getEditor();
    if (!editor) return;
    if (editor.tool !== 'select') {
      editor.finishPaint();
      return;
    }
    const found = locate(editor, e);
    if (found?.hit?.kind === 'edge') {
      editor.insertOnSegment(found.hit.layer, found.hit.id, found.hit.segment);
    }
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    surface.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  };

  // Middle click and right click belong to panning, so the browser's own actions are suppressed.
  const onAuxClick = (e: MouseEvent): void => {
    e.preventDefault();
  };
  const onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const editor = getEditor();
    if (!editor || isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const painting = editor.tool !== 'select';

    if (e.key === ' ') {
      e.preventDefault();
      if (!spaceHeld) {
        spaceHeld = true;
        setCursor();
      }
      return;
    }
    const step = e.shiftKey ? ARROW_PAN_SHIFT_PX : ARROW_PAN_PX;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      surface.panBy(step, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      surface.panBy(-step, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      surface.panBy(0, step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      surface.panBy(0, -step);
    } else if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      editor.undo();
    } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      editor.redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (painting) editor.removePaintPoint();
      else if (
        editor.selection?.index !== null &&
        editor.selection?.index !== undefined
      )
        editor.deleteSelectedPoint();
      else editor.deleteSelectedShapes();
    } else if (e.key === 'Enter' && painting) {
      e.preventDefault();
      editor.finishPaint();
    } else if (e.key === 'Escape') {
      if (painting) editor.cancelPaint();
      else editor.select(null);
    }
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key !== ' ') return;
    spaceHeld = false;
    setCursor();
  };

  // Losing focus while Space is held must not leave panning stuck on.
  const onBlur = (): void => {
    spaceHeld = false;
    setCursor();
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('auxclick', onAuxClick);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('dblclick', onDblClick);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('auxclick', onAuxClick);
    canvas.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
