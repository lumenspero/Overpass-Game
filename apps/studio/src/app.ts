import { h, type Attributes, type ComponentChildren, type VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_FRAME_TILES, IMPORT, TERRAIN_ZOOM } from './config.ts';
import {
  frameAt,
  frameBBox,
  frameFromDrag,
  isInsideContinentalUS,
  isInsideContinentalUSPoint,
  withRotation,
  type Frame,
} from './geo/frame.ts';
import type { Metres } from './geo/mercator.ts';
import { convertFeatures } from './import/convert.ts';
import { buildSourceMap } from './import/source-map.ts';
import { MapPanel } from './map/map-panel.ts';
import { loadRegion } from './osm/region.ts';
import { Editor, type Selection } from './edit/editor.ts';
import { attachInteraction } from './edit/interaction.ts';
import { replaceLayer } from './edit/ops.ts';
import { PAINT_SPECS, PAINT_TOOLS } from './edit/paint.ts';
import type { Pt } from './edit/hit.ts';
import { PreviewCanvas } from './preview/preview-canvas.ts';
import { searchPlaces, type PlaceCandidate } from './search/nominatim.ts';
import { loadTerrain } from './terrain/load.ts';
import { deriveMountains } from './terrain/mountains.ts';
import { elevationGrid } from './terrain/terrarium.ts';

/**
 * Preact's h() typings are strict about prop shapes, which gets in the way of a
 * plain list of HTML elements. This wrapper keeps the call sites simple.
 */
function el(
  tag: string,
  props: Record<string, unknown> | null,
  ...children: ComponentChildren[]
): VNode {
  return h(tag, props as Attributes | null, ...children) as VNode;
}

function describeFrame(frame: Frame | null): string {
  if (!frame) return 'No frame yet.';
  const inside = isInsideContinentalUS(frame);
  return `${frame.cols} × ${frame.rows} tiles, turned ${frame.rotationDeg}°. ${
    inside
      ? 'Inside the continental US box.'
      : 'Outside the continental US box: move or shrink the frame.'
  }`;
}

/**
 * Terrain is optional: if its tiles cannot be loaded, the import goes ahead
 * without mountains. Returns the elevation for each grid tile, or null.
 */
async function loadElevation(frame: Frame): Promise<Float32Array | null> {
  try {
    const tiles = await loadTerrain(frame, TERRAIN_ZOOM);
    return elevationGrid(frame, tiles, TERRAIN_ZOOM);
  } catch {
    return null;
  }
}

function sameFrame(a: Frame, b: Frame): boolean {
  return (
    a.centre[0] === b.centre[0] &&
    a.centre[1] === b.centre[1] &&
    a.cols === b.cols &&
    a.rows === b.rows &&
    a.rotationDeg === b.rotationDeg
  );
}

const NO_POINTS: readonly Pt[] = [];

function describeSelection(sel: Selection | null): string {
  if (!sel) return 'Click a shape to select it.';
  return sel.index === null
    ? `Selected ${sel.id}.`
    : `Selected ${sel.id}, point ${sel.index + 1}.`;
}

/** The Studio's screen: place search, the real map, the frame, the OSM import and the game-style preview. */
export function App(): VNode {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<PlaceCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{
    frame: Frame;
    elevation: Float32Array | null;
  } | null>(null);
  const [mountainThreshold, setMountainThreshold] = useState<number>(
    IMPORT.mountainThresholdDefault,
  );
  const [message, setMessage] = useState(
    'Search for a place, or turn on Draw frame and drag across the map.',
  );

  // Refs let the map's callbacks read the latest state without re-creating the map.
  const latestFrame = useRef<Frame | null>(null);
  latestFrame.current = frame;
  const latestPlaces = useRef<PlaceCandidate[]>([]);
  latestPlaces.current = places;
  const mapElement = useRef<HTMLDivElement | null>(null);
  const canvasElement = useRef<HTMLCanvasElement | null>(null);
  const mapPanel = useRef<MapPanel | null>(null);
  const preview = useRef<PreviewCanvas | null>(null);
  const editor = useRef<Editor | null>(null);
  const [, setVersion] = useState(0);

  const pickPlace = (id: string): void => {
    const place = latestPlaces.current.find((p) => p.id === id);
    if (!place) return;
    const prev = latestFrame.current;
    const next = frameAt(
      place.centre,
      prev?.cols ?? DEFAULT_FRAME_TILES,
      prev?.rows ?? DEFAULT_FRAME_TILES,
      prev?.rotationDeg ?? 0,
    );
    setSelectedId(id);
    setPlaceName(place.name);
    setFrame(next);
    setMessage(
      `Framed ${place.name}. Turn or redraw the frame if it needs adjusting.`,
    );
    mapPanel.current?.fitTo(frameBBox(next));
  };

  const drawFrame = (start: Metres, end: Metres): void => {
    const next = frameFromDrag(
      start,
      end,
      latestFrame.current?.rotationDeg ?? 0,
    );
    setFrame(next);
    setMessage('Frame drawn. Drag again to redraw it.');
  };

  // The map is created once; its callbacks reach the latest handlers through this ref.
  const handlers = useRef({ pickPlace, drawFrame });
  handlers.current = { pickPlace, drawFrame };

  useEffect(() => {
    const container = mapElement.current;
    const canvas = canvasElement.current;
    if (!container || !canvas) return;
    const panel = new MapPanel(container, {
      onFrameDrawn: (start, end) => handlers.current.drawFrame(start, end),
      onPickPlace: (id) => handlers.current.pickPlace(id),
    });
    const previewCanvas = new PreviewCanvas(canvas);
    mapPanel.current = panel;
    preview.current = previewCanvas;
    const detach = attachInteraction(
      canvas,
      previewCanvas,
      () => editor.current,
    );
    return () => {
      detach();
      panel.destroy();
      previewCanvas.destroy();
      mapPanel.current = null;
      preview.current = null;
    };
  }, []);

  // One source of truth: the frame drives both the real map and the preview.
  useEffect(() => {
    mapPanel.current?.setFrame(frame);
    preview.current?.setFrame(
      frame,
      frame ? isInsideContinentalUS(frame) : true,
    );
  }, [frame]);

  // Imported features show only while the frame is the one they were imported for.
  // The editor's map is the source, so edits show as they are made.
  const editorMap = editor.current?.map ?? null;
  const sourceForPreview =
    imported && frame && sameFrame(imported.frame, frame) ? editorMap : null;
  useEffect(() => {
    preview.current?.setSource(sourceForPreview);
  }, [sourceForPreview]);

  const selection = editor.current?.selection ?? null;
  useEffect(() => {
    preview.current?.setEditState(sourceForPreview !== null, selection);
  }, [sourceForPreview, selection]);

  // The shape being painted is drawn over the map.
  const tool = editor.current?.tool ?? 'select';
  const pendingPoints = editor.current?.pendingPoints ?? NO_POINTS;
  const riverWidth = editor.current?.riverWidth ?? IMPORT.riverWidthDefault;
  useEffect(() => {
    preview.current?.setPending(
      tool === 'select' ? null : tool,
      pendingPoints,
      riverWidth,
    );
  }, [tool, pendingPoints, riverWidth]);

  // Each edit re-renders the screen, so the preview and the panels stay in step.
  useEffect(() => {
    return editor.current?.subscribe(() => setVersion((v) => v + 1));
  }, [imported]);

  useEffect(() => {
    mapPanel.current?.setCandidates(places, selectedId);
  }, [places, selectedId]);

  useEffect(() => {
    mapPanel.current?.setDrawMode(drawMode);
  }, [drawMode]);

  async function onSearch(event: Event): Promise<void> {
    event.preventDefault();
    const q = query.trim();
    if (q === '') return;
    setBusy(true);
    setMessage('Searching…');
    try {
      const found = await searchPlaces(q);
      setPlaces(found);
      setSelectedId(null);
      setMessage(
        found.length > 0
          ? `${found.length} places found. Pick one to frame it.`
          : 'No places found. Try another name.',
      );
    } catch (err) {
      setPlaces([]);
      setSelectedId(null);
      setMessage(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onImport(): Promise<void> {
    const current = latestFrame.current;
    if (!current || !isInsideContinentalUS(current)) return;
    setImporting(true);
    setMessage('Fetching OpenStreetMap data…');
    try {
      const loaded = await loadRegion(current);
      setMessage(
        loaded.cached
          ? 'Using cached OpenStreetMap data. Loading terrain…'
          : 'Converting features and loading terrain…',
      );
      const layers = convertFeatures(loaded.collection, current);
      const elevation = await loadElevation(current);
      const mountains = elevation
        ? deriveMountains(
            elevation,
            current.cols,
            current.rows,
            mountainThreshold,
          )
        : [];
      const map = buildSourceMap({
        name: placeName ?? 'Imported map',
        frame: current,
        layers,
        mountains,
        queryHash: loaded.hash,
        fetchedAt: new Date().toISOString(),
      });
      editor.current = new Editor(map);
      setImported({ frame: current, elevation });
      setMessage(
        `Imported ${layers.water.length} water shapes, ${layers.parks.length} parks, ${layers.motorwayGuide.length} motorway lines and ${mountains.length} mountains.${
          elevation
            ? ''
            : ' Terrain was unavailable, so no mountains were added.'
        }`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  /** Runs on slider release: rebuilds the mountain layer. It is one undoable edit, and it replaces hand-edited mountains. */
  function onMountainThreshold(threshold: number): void {
    const current = imported;
    if (!current?.elevation) return;
    const mountains = deriveMountains(
      current.elevation,
      current.frame.cols,
      current.frame.rows,
      threshold,
    );
    editor.current?.apply((m) => replaceLayer(m, 'mountains', mountains));
    setMessage(`${mountains.length} mountains at ${threshold} m and above.`);
  }

  function onRotate(deg: number): void {
    setFrame((prev) => (prev ? withRotation(prev, deg) : prev));
  }

  const turn = frame?.rotationDeg ?? 0;
  const importable =
    frame !== null && isInsideContinentalUS(frame) && !importing && !busy;
  const importStale =
    imported !== null && frame !== null && !sameFrame(imported.frame, frame);

  return el(
    'div',
    { class: 'studio' },
    el(
      'aside',
      { class: 'sidebar' },
      el('h1', null, 'Overpass_Game Map Studio'),
      el(
        'form',
        { class: 'search', onSubmit: onSearch },
        el('label', { for: 'place-query' }, 'Place'),
        el('input', {
          id: 'place-query',
          type: 'search',
          value: query,
          placeholder: 'e.g. Tulsa, Oklahoma',
          onInput: (e: Event) =>
            setQuery((e.currentTarget as HTMLInputElement).value),
        }),
        el(
          'button',
          { type: 'submit', disabled: busy },
          busy ? 'Searching…' : 'Search',
        ),
      ),
      el(
        'ul',
        { class: 'results', 'data-testid': 'results' },
        places.map((p): VNode => {
          const inside = isInsideContinentalUSPoint(p.centre);
          return el(
            'li',
            { key: p.id },
            el(
              'button',
              {
                type: 'button',
                class: p.id === selectedId ? 'is-selected' : '',
                onClick: () => pickPlace(p.id),
              },
              p.name,
              el(
                'span',
                { class: inside ? 'badge' : 'badge is-outside' },
                inside ? '' : ' (outside US box)',
              ),
            ),
          );
        }),
      ),
      el(
        'section',
        { class: 'frame-controls' },
        el('h2', null, 'Frame'),
        el(
          'button',
          {
            type: 'button',
            class: drawMode ? 'toggle on' : 'toggle',
            'aria-pressed': drawMode ? 'true' : 'false',
            onClick: () => setDrawMode(!drawMode),
          },
          drawMode ? 'Drawing: drag on the map' : 'Draw frame',
        ),
        el('label', { for: 'turn' }, `Turn: ${turn}°`),
        el('input', {
          id: 'turn',
          type: 'range',
          min: -180,
          max: 180,
          step: 1,
          value: turn,
          disabled: !frame,
          onInput: (e: Event) =>
            onRotate(Number((e.currentTarget as HTMLInputElement).value)),
        }),
        el(
          'button',
          { type: 'button', disabled: !frame, onClick: () => onRotate(0) },
          'Reset turn',
        ),
        el(
          'p',
          { class: 'frame-status', 'data-testid': 'frame-status' },
          describeFrame(frame),
        ),
      ),
      el(
        'section',
        { class: 'import-controls' },
        el('h2', null, 'Map data'),
        el(
          'button',
          { type: 'button', disabled: !importable, onClick: onImport },
          importing ? 'Importing…' : 'Import OpenStreetMap data',
        ),
        el(
          'label',
          { for: 'mountain-threshold' },
          `Mountains above ${mountainThreshold} m`,
        ),
        el('input', {
          id: 'mountain-threshold',
          type: 'range',
          min: IMPORT.mountainThresholdMin,
          max: IMPORT.mountainThresholdMax,
          step: IMPORT.mountainThresholdStep,
          value: mountainThreshold,
          disabled: !imported?.elevation || importStale,
          onInput: (e: Event) =>
            setMountainThreshold(
              Number((e.currentTarget as HTMLInputElement).value),
            ),
          onChange: (e: Event) =>
            onMountainThreshold(
              Number((e.currentTarget as HTMLInputElement).value),
            ),
        }),
        importStale
          ? el(
              'p',
              { class: 'frame-status' },
              'The frame changed since the last import. Import again to update the map.',
            )
          : null,
      ),
      imported
        ? el(
            'section',
            { class: 'edit-controls' },
            el('h2', null, 'Edit'),
            el(
              'p',
              { class: 'frame-status', 'data-testid': 'edit-status' },
              describeSelection(selection),
            ),
            el(
              'div',
              { class: 'edit-row' },
              el(
                'button',
                {
                  type: 'button',
                  disabled: !editor.current?.undoable,
                  onClick: () => editor.current?.undo(),
                },
                'Undo',
              ),
              el(
                'button',
                {
                  type: 'button',
                  disabled: !editor.current?.redoable,
                  onClick: () => editor.current?.redo(),
                },
                'Redo',
              ),
            ),
            el(
              'button',
              {
                type: 'button',
                disabled: selection === null || selection.index === null,
                onClick: () => editor.current?.deleteSelectedPoint(),
              },
              'Delete point',
            ),
            el(
              'div',
              { class: 'edit-row' },
              el(
                'button',
                {
                  type: 'button',
                  disabled: selection === null,
                  onClick: () => editor.current?.rotateSelected(-15),
                },
                'Turn −15°',
              ),
              el(
                'button',
                {
                  type: 'button',
                  disabled: selection === null,
                  onClick: () => editor.current?.rotateSelected(15),
                },
                'Turn +15°',
              ),
            ),
            el(
              'div',
              { class: 'edit-row' },
              el(
                'button',
                {
                  type: 'button',
                  disabled: selection === null,
                  onClick: () => editor.current?.scaleSelected(0.9),
                },
                'Shrink 10%',
              ),
              el(
                'button',
                {
                  type: 'button',
                  disabled: selection === null,
                  onClick: () => editor.current?.scaleSelected(1.1),
                },
                'Grow 10%',
              ),
            ),
            el(
              'p',
              { class: 'frame-status' },
              'Drag an anchor, a handle or a shape. Double-click an edge to add a point. Ctrl+Z undoes, Ctrl+Y redoes.',
            ),
          )
        : null,
      imported
        ? el(
            'section',
            { class: 'tools' },
            el('h2', null, 'Draw'),
            el(
              'div',
              { class: 'tool-grid' },
              el(
                'button',
                {
                  type: 'button',
                  class: tool === 'select' ? 'toggle on' : 'toggle',
                  'aria-pressed': tool === 'select' ? 'true' : 'false',
                  onClick: () => editor.current?.setTool('select'),
                },
                'Select',
              ),
              ...PAINT_TOOLS.map((t) =>
                el(
                  'button',
                  {
                    key: t,
                    type: 'button',
                    class: tool === t ? 'toggle on' : 'toggle',
                    'aria-pressed': tool === t ? 'true' : 'false',
                    onClick: () => editor.current?.setTool(t),
                  },
                  PAINT_SPECS[t].label,
                ),
              ),
            ),
            tool === 'river'
              ? el(
                  'div',
                  null,
                  el(
                    'label',
                    { for: 'river-width' },
                    'River width: ' + riverWidth.toFixed(2) + ' tiles',
                  ),
                  el('input', {
                    id: 'river-width',
                    type: 'range',
                    min: IMPORT.riverWidthMin,
                    max: IMPORT.riverWidthMax,
                    step: 0.05,
                    value: riverWidth,
                    onInput: (e: Event) =>
                      editor.current?.setRiverWidth(
                        Number((e.currentTarget as HTMLInputElement).value),
                      ),
                  }),
                )
              : null,
            tool !== 'select'
              ? el(
                  'p',
                  { class: 'frame-status', 'data-testid': 'paint-status' },
                  PAINT_SPECS[tool].label +
                    ': click to add points (' +
                    pendingPoints.length +
                    ' so far). Double-click or Enter finishes; click the first point to close; Escape cancels.',
                )
              : null,
          )
        : null,
      el('p', { class: 'message', role: 'status' }, message),
    ),
    el('div', {
      class: 'map-panel',
      'data-testid': 'map-panel',
      ref: mapElement,
    }),
    el(
      'div',
      { class: 'preview-panel' },
      el('canvas', { ref: canvasElement, 'data-testid': 'preview-canvas' }),
    ),
  );
}
