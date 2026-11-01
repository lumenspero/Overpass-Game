import { EDIT } from '../config.ts';
import type { Editor, Selection } from './editor.ts';
import { hitTest, type Pt, type Target } from './hit.ts';

/** What the interaction needs from the canvas: where a client position sits in the source grid. */
export interface Surface {
  locate(
    clientX: number,
    clientY: number,
  ): { point: Pt; tilesPerPixel: number } | null;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

function targetOf(sel: Selection | null): Target | null {
  return sel ? { layer: sel.layer, id: sel.id } : null;
}

/**
 * Pointer and keyboard editing for the preview canvas.
 *
 * Select tool: a press grabs the handle, anchor or shape under the pointer and dragging moves
 * it; a press on nothing clears the selection; double-clicking an edge adds a point there.
 *
 * Paint tools: each click adds a point; a click on the first point of a closed shape closes it,
 * and a double-click finishes any shape.
 *
 * Keyboard: Ctrl/Cmd+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes. Delete or Backspace removes the
 * selected point, or the last pending point while painting. Enter finishes a painted shape,
 * and Escape cancels it or clears the selection.
 *
 * Returns a function that removes every listener.
 */
export function attachInteraction(
  canvas: HTMLCanvasElement,
  surface: Surface,
  getEditor: () => Editor | null,
): () => void {
  let dragging = false;
  canvas.style.touchAction = 'none';

  const hitAt = (editor: Editor, e: MouseEvent) => {
    const loc = surface.locate(e.clientX, e.clientY);
    if (!loc) return null;
    const tol = EDIT.hitRadiusPx * loc.tilesPerPixel;
    const hit = hitTest(editor.map, loc.point, tol, targetOf(editor.selection));
    return { loc, hit, tol };
  };

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const editor = getEditor();
    if (!editor) return;
    const found = hitAt(editor, e);
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
      editor.select(null);
      return;
    }
    editor.beginDrag(found.hit, found.loc.point);
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const editor = getEditor();
    const loc = surface.locate(e.clientX, e.clientY);
    if (editor && loc) editor.dragTo(loc.point);
  };

  const onUp = (): void => {
    if (!dragging) return;
    dragging = false;
    getEditor()?.endDrag();
  };

  const onCancel = (): void => {
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
    const found = hitAt(editor, e);
    if (found?.hit?.kind === 'edge') {
      editor.insertOnSegment(found.hit.layer, found.hit.id, found.hit.segment);
    }
  };

  const onKey = (e: KeyboardEvent): void => {
    const editor = getEditor();
    if (!editor || isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const painting = editor.tool !== 'select';

    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      editor.undo();
    } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      editor.redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (painting) editor.removePaintPoint();
      else editor.deleteSelectedPoint();
    } else if (e.key === 'Enter' && painting) {
      e.preventDefault();
      editor.finishPaint();
    } else if (e.key === 'Escape') {
      if (painting) editor.cancelPaint();
      else editor.select(null);
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('dblclick', onDblClick);
  window.addEventListener('keydown', onKey);

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('dblclick', onDblClick);
    window.removeEventListener('keydown', onKey);
  };
}
