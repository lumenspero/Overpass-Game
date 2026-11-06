import { h, type Attributes, type ComponentChildren, type VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  AUTOSAVE_MS,
  DEFAULT_FRAME_TILES,
  IMPORT,
  TERRAIN_ZOOM,
} from './config.ts';
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
import { buildSourceMap, slugify } from './import/source-map.ts';
import { MapPanel } from './map/map-panel.ts';
import { MIN_FENCE_TILES } from './edit/ops.ts';
import { loadRegion } from './osm/region.ts';
import { Editor, type Selection } from './edit/editor.ts';
import { attachInteraction } from './edit/interaction.ts';
import {
  allowedOffersOf,
  replaceLayer,
  type EditableLayer,
} from './edit/ops.ts';
import { LABEL_SIZE } from './edit/labels.ts';
import {
  BASE_PALETTE_IDS,
  WATER_PALETTE_IDS,
  resolvePalette,
  type LabelKind,
  type ThemeMode,
} from '@overpass-game/render-style';
import { PAINT_SPECS, PAINT_TOOLS } from './edit/paint.ts';
import type { Pt, Target } from './edit/hit.ts';
import { PreviewCanvas } from './preview/preview-canvas.ts';
import { searchPlaces, type PlaceCandidate } from './search/nominatim.ts';
import { loadTerrain } from './terrain/load.ts';
import { deriveMountains } from './terrain/mountains.ts';
import { elevationGrid } from './terrain/terrarium.ts';
import { debounce, type Debouncer } from './drafts/debounce.ts';
import { makeDraft, type Draft } from './drafts/draft.ts';
import { listDrafts, removeDraft, saveDraft } from './drafts/store.ts';

/**
 * Preact's h() typings are strict about prop shapes, which gets in the way of a
 * plain list of HTML elements. This wrapper keeps the call sites simple.
 */
/** Label kinds with the names the Labels panel shows. */
import {
  RESTRICTABLE_OFFERS,
  type RestrictableOffer,
} from '@overpass-game/map-schema';

/** Names for the offer checkboxes. */
/** The starting fence's fields, in the order the Studio shows them. */
const FENCE_FIELDS = ['col', 'row', 'cols', 'rows'] as const;
const FENCE_NAMES: Record<(typeof FENCE_FIELDS)[number], string> = {
  col: 'Left tile',
  row: 'Top tile',
  cols: 'Width (tiles)',
  rows: 'Height (tiles)',
};

const OFFER_NAMES: Record<RestrictableOffer, string> = {
  motorway: 'Motorways',
  bridge: 'Bridges',
  roundabout: 'Roundabouts',
  tunnel: 'Tunnels',
  lights: 'Traffic lights',
};

const LABEL_KIND_OPTIONS: readonly [LabelKind, string][] = [
  ['park', 'Park'],
  ['mountain', 'Mountain'],
  ['water', 'Water'],
];

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

const LAYER_NAMES: readonly EditableLayer[] = [
  'water',
  'mountains',
  'parks',
  'motorwayGuide',
  'starterRoads',
];

const LAYER_LABELS: Record<EditableLayer, string> = {
  water: 'Water',
  mountains: 'Mountains',
  parks: 'Parks',
  motorwayGuide: 'Motorway guide',
  starterRoads: 'Starter roads',
};

/** One layer in the Layers panel: its name, a show/hide toggle, and a lock toggle. */
function layerRow(editor: Editor | null, layer: EditableLayer): VNode {
  const hidden = editor?.hiddenLayers.has(layer) ?? false;
  const locked = editor?.lockedLayers.has(layer) ?? false;
  return el(
    'div',
    { key: layer, class: 'layer-row' },
    el('span', null, LAYER_LABELS[layer]),
    el(
      'button',
      {
        type: 'button',
        class: hidden ? 'toggle' : 'toggle on',
        'aria-pressed': hidden ? 'false' : 'true',
        onClick: () => editor?.toggleLayerVisible(layer),
      },
      hidden ? 'Hidden' : 'Shown',
    ),
    el(
      'button',
      {
        type: 'button',
        class: locked ? 'toggle on' : 'toggle',
        'aria-pressed': locked ? 'true' : 'false',
        onClick: () => editor?.toggleLayerLocked(layer),
      },
      locked ? 'Locked' : 'Unlocked',
    ),
  );
}

const NO_POINTS: readonly Pt[] = [];

/** Every saved draft. A store that cannot be read counts as having none. */
async function readDraftList(): Promise<{ id: string; draft: Draft }[]> {
  try {
    return await listDrafts();
  } catch {
    return [];
  }
}

function describeSelection(sel: Selection | null, count: number): string {
  if (count > 1) return `${count} shapes selected.`;
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
  const [shortMax, setShortMax] = useState(2);
  const [outlines, setOutlines] = useState(false);
  const [drafts, setDrafts] = useState<{ id: string; draft: Draft }[]>([]);
  // Light or dark: how the preview is drawn. It is a view setting, not map data.
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [draftNote, setDraftNote] = useState('');
  const saver = useRef<Debouncer | null>(null);
  // Read by the autosave when it fires, so it always sees the latest state.
  const draftInputs = useRef<{
    imported: { frame: Frame; elevation: Float32Array | null } | null;
    mountainThreshold: number;
  }>({ imported: null, mountainThreshold: IMPORT.mountainThresholdDefault });
  draftInputs.current = { imported, mountainThreshold };

  useEffect(() => {
    const d = debounce(AUTOSAVE_MS, () => {
      void saveDraftNow();
    });
    saver.current = d;
    void readDraftList().then(setDrafts);
    return () => d.flush();
  }, []);

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
    // If the real map cannot start (for example, no WebGL), keep the rest of the screen working.
    let panel: MapPanel | null = null;
    try {
      panel = new MapPanel(container, {
        onFrameDrawn: (start, end) => handlers.current.drawFrame(start, end),
        onPickPlace: (id) => handlers.current.pickPlace(id),
      });
    } catch (err) {
      console.error(err);
      setMessage(
        `The real map could not start: ${err instanceof Error ? err.message : String(err)}. The preview still works.`,
      );
    }
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
      panel?.destroy();
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
  const editorMap = editor.current?.display ?? null;
  const sourceForPreview =
    imported && frame && sameFrame(imported.frame, frame) ? editorMap : null;
  useEffect(() => {
    preview.current?.setSource(sourceForPreview);
  }, [sourceForPreview]);

  const selection = editor.current?.selection ?? null;
  const shapes: Target[] = editor.current?.selectedShapes ?? [];
  const shapesKey = shapes.map((t) => t.layer + ':' + t.id).join('|');
  useEffect(() => {
    preview.current?.setEditState(sourceForPreview !== null, selection, shapes);
  }, [sourceForPreview, selection, shapesKey]);

  // The shape being painted is drawn over the map.
  const tool = editor.current?.tool ?? 'select';
  const pendingPoints = editor.current?.pendingPoints ?? NO_POINTS;
  const riverWidth = editor.current?.riverWidth ?? IMPORT.riverWidthDefault;
  useEffect(() => {
    preview.current?.setPending(
      tool === 'select' || tool === 'label' ? null : tool,
      pendingPoints,
      riverWidth,
    );
  }, [tool, pendingPoints, riverWidth]);

  // The palette family comes from the map; light or dark comes from the toggle.
  const paletteId = editor.current?.map.palette ?? 'default';
  const waterId = editor.current?.map.waterPalette ?? 'shared';
  const allowedOffers = editor.current
    ? allowedOffersOf(editor.current.map)
    : [...RESTRICTABLE_OFFERS];
  const startFence = editor.current?.map.grid.fence ?? null;
  const gridCols = editor.current?.map.grid.cols ?? 0;
  const gridRows = editor.current?.map.grid.rows ?? 0;
  const fenceKey = startFence
    ? `${startFence.col},${startFence.row},${startFence.cols},${startFence.rows}`
    : '';
  useEffect(() => {
    preview.current?.setFence(startFence);
    // The key stands for the fence; the map id covers switching between maps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fenceKey, editor.current?.map.id]);
  useEffect(() => {
    preview.current?.setPalette(resolvePalette(paletteId, themeMode, waterId));
  }, [paletteId, waterId, themeMode]);

  const selectedLabel = editor.current?.selectedLabel ?? null;
  const selectedLabelId = selectedLabel?.id ?? null;
  useEffect(() => {
    preview.current?.setLabelSelection(selectedLabelId);
  }, [selectedLabelId]);

  // Each edit re-renders the screen, so the preview and the panels stay in step.
  useEffect(() => {
    let seen = editor.current?.map;
    return editor.current?.subscribe(() => {
      setVersion((v) => v + 1);
      // Selection and view changes leave the map alone, so only map edits schedule a save.
      const ed = editor.current;
      if (ed && ed.map !== seen) {
        seen = ed.map;
        saver.current?.schedule();
      }
    });
  }, [imported]);

  useEffect(() => {
    mapPanel.current?.setCandidates(places, selectedId);
  }, [places, selectedId]);

  useEffect(() => {
    mapPanel.current?.setDrawMode(drawMode);
  }, [drawMode]);

  useEffect(() => {
    preview.current?.setOutlines(outlines);
  }, [outlines]);

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

  /** Saves the open map as a draft. It reads the editor when it runs, so it always saves the latest state. */
  async function saveDraftNow(): Promise<void> {
    const ed = editor.current;
    const inputs = draftInputs.current;
    if (!ed || !inputs.imported) return;
    const map = ed.map;
    try {
      await saveDraft(
        map.id,
        makeDraft({
          placeName: map.name,
          frame: inputs.imported.frame,
          mountainThreshold: inputs.mountainThreshold,
          elevation: inputs.imported.elevation,
          map,
        }),
      );
      setDraftNote(`Draft saved at ${new Date().toLocaleTimeString()}.`);
      setDrafts(await readDraftList());
    } catch {
      setDraftNote(
        'Could not save a draft. Browser storage may be blocked, so this work lasts only until the page is reloaded.',
      );
    }
  }

  /** Reopens a saved draft. The open map is saved first, so nothing is lost. */
  function onRestore(draft: Draft): void {
    saver.current?.flush();
    editor.current = new Editor(draft.map);
    setImported({ frame: draft.frame, elevation: draft.elevation });
    setFrame(draft.frame);
    setPlaceName(draft.placeName);
    setMountainThreshold(draft.mountainThreshold);
    setMessage(
      `Restored the draft of ${draft.placeName}, saved ${new Date(draft.savedAt).toLocaleString()}.`,
    );
  }

  /** Deletes a saved draft. */
  async function onDiscard(id: string, name: string): Promise<void> {
    try {
      await removeDraft(id);
      setDrafts(await readDraftList());
      setDraftNote(`Discarded the draft of ${name}.`);
    } catch {
      setDraftNote('Could not discard the draft.');
    }
  }

  /** Writes the open map to maps/. Play then opens the game on it in a new tab. */
  async function exportOpenMap(play: boolean): Promise<void> {
    const ed = editor.current;
    if (!ed) return;
    // Opened before the request: a tab opened after an await can be blocked as a popup.
    const tab = play ? window.open('', '_blank') : null;
    setMessage(play ? 'Exporting and opening the game…' : 'Exporting…');
    try {
      const res = await fetch('/api/export-map', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ed.display),
      });
      let body: { error?: string; file?: string; playUrl?: string };
      try {
        body = await res.json();
      } catch {
        throw new Error(
          'Export needs the Studio dev server running (pnpm dev:studio).',
        );
      }
      if (!res.ok || !body.playUrl || !body.file) {
        throw new Error(body.error ?? 'Export failed.');
      }
      // Hidden layers are left out of the export, so say so.
      const left =
        ed.hiddenLayers.size > 0 ? ' Hidden layers were left out.' : '';
      if (!play) {
        setMessage(`Exported ${body.file}.${left}`);
      } else if (tab) {
        tab.location.href = body.playUrl;
        setMessage(`Exported ${body.file} and opened the game.${left}`);
      } else {
        setMessage(
          `Exported ${body.file}.${left} Your browser blocked the new tab: open ${body.playUrl}`,
        );
      }
    } catch (err) {
      tab?.close();
      setMessage(err instanceof Error ? err.message : 'Export failed.');
    }
  }

  async function onImport(): Promise<void> {
    const current = latestFrame.current;
    if (!current || !isInsideContinentalUS(current)) return;
    // A draft is keyed by the place's slug, so a fresh import would replace it. Ask first.
    const name = placeName ?? 'Imported map';
    if (
      drafts.some((d) => d.id === slugify(name)) &&
      !window.confirm(
        `A draft of ${name} already exists. Importing again replaces it. Continue?`,
      )
    ) {
      setMessage('Import cancelled. The existing draft is kept.');
      return;
    }
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
      saver.current?.schedule();
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
          'button',
          {
            type: 'button',
            disabled: !imported,
            onClick: () => exportOpenMap(false),
          },
          'Export to maps/',
        ),
        el(
          'button',
          {
            type: 'button',
            disabled: !imported,
            onClick: () => exportOpenMap(true),
          },
          'Play this map',
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
        draftNote
          ? el('p', { class: 'frame-status', role: 'status' }, draftNote)
          : null,
        drafts.length > 0
          ? el(
              'div',
              { class: 'draft-list' },
              el('h3', null, 'Drafts'),
              ...drafts.map(({ id, draft }) =>
                el(
                  'div',
                  { class: 'draft-row' },
                  el(
                    'span',
                    null,
                    `${draft.placeName}, saved ${new Date(draft.savedAt).toLocaleString()}`,
                  ),
                  el(
                    'button',
                    { type: 'button', onClick: () => onRestore(draft) },
                    'Restore',
                  ),
                  el(
                    'button',
                    {
                      type: 'button',
                      onClick: () => onDiscard(id, draft.placeName),
                    },
                    'Discard',
                  ),
                ),
              ),
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
              describeSelection(selection, shapes.length),
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
              'div',

              { class: 'edit-row' },

              el(
                'button',
                {
                  type: 'button',
                  disabled: selection === null,
                  onClick: () => editor.current?.setShapesLocked(true),
                },
                'Lock shapes',
              ),

              el(
                'button',
                {
                  type: 'button',
                  disabled: selection === null,
                  onClick: () => editor.current?.setShapesLocked(false),
                },
                'Unlock shapes',
              ),
            ),

            el(
              'button',
              {
                type: 'button',
                disabled: selection === null,
                onClick: () => editor.current?.deleteSelectedShapes(),
              },
              'Delete shapes',
            ),

            el(
              'p',
              { class: 'frame-status' },
              'Drag an anchor, a handle or a shape. Double-click an edge to add a point. Ctrl+Z undoes, Ctrl+Y redoes.',
            ),
          )
        : null,
      el(
        'section',
        { class: 'appearance' },
        el('h2', null, 'Appearance'),
        el(
          'div',
          { class: 'tool-grid' },
          ...(['light', 'dark'] as const).map((mode) =>
            el(
              'button',
              {
                key: mode,
                type: 'button',
                class: themeMode === mode ? 'toggle on' : 'toggle',
                'aria-pressed': themeMode === mode ? 'true' : 'false',
                onClick: () => setThemeMode(mode),
              },
              mode === 'light' ? 'Light' : 'Dark',
            ),
          ),
        ),
        imported
          ? el(
              'div',
              null,
              el(
                'label',
                { for: 'palette-family' },
                'Base palette (used by the game too)',
              ),
              el(
                'select',
                {
                  id: 'palette-family',
                  value: (BASE_PALETTE_IDS as readonly string[]).includes(
                    paletteId,
                  )
                    ? paletteId
                    : 'white',
                  onChange: (e: Event) =>
                    editor.current?.setPalette(
                      (e.currentTarget as HTMLSelectElement).value,
                    ),
                },
                BASE_PALETTE_IDS.map((id) =>
                  el('option', { key: id, value: id }, id),
                ),
              ),
              el(
                'label',
                { for: 'water-palette' },
                'Water palette (used by the game too)',
              ),
              el(
                'select',
                {
                  id: 'water-palette',
                  value: waterId,
                  onChange: (e: Event) =>
                    editor.current?.setWaterPalette(
                      (e.currentTarget as HTMLSelectElement).value,
                    ),
                },
                WATER_PALETTE_IDS.map((id) =>
                  el(
                    'option',
                    { key: id, value: id },
                    id === 'shared' ? 'Shared ramp (approved)' : 'From ' + id,
                  ),
                ),
              ),
              el(
                'fieldset',
                { class: 'offers' },
                el(
                  'legend',
                  null,
                  'Allowed offers (road tiles are always allowed)',
                ),
                RESTRICTABLE_OFFERS.map((id) => {
                  const on = allowedOffers.includes(id);
                  return el(
                    'label',
                    { key: id },
                    el('input', {
                      type: 'checkbox',
                      checked: on,
                      // The last option stays on, so the player always has a choice.
                      disabled: on && allowedOffers.length === 1,
                      onChange: (e: Event) => {
                        const checked = (e.currentTarget as HTMLInputElement)
                          .checked;
                        const next = checked
                          ? [...allowedOffers, id]
                          : allowedOffers.filter((x) => x !== id);
                        editor.current?.setAllowedOffers(next);
                      },
                    }),
                    ' ' + OFFER_NAMES[id],
                  );
                }),
              ),
              startFence
                ? el(
                    'fieldset',
                    { class: 'fence' },
                    el(
                      'legend',
                      null,
                      'Starting fence (only tiles inside take roads, buildings and spawns)',
                    ),
                    FENCE_FIELDS.map((key) =>
                      el(
                        'label',
                        { key },
                        ' ' + FENCE_NAMES[key],
                        el('input', {
                          type: 'number',
                          step: 1,
                          min:
                            key === 'cols' || key === 'rows'
                              ? MIN_FENCE_TILES
                              : 0,
                          value: startFence[key],
                          onChange: (e: Event) =>
                            editor.current?.setStartingFence({
                              ...startFence,
                              [key]: Number(
                                (e.currentTarget as HTMLInputElement).value,
                              ),
                            }),
                        }),
                      ),
                    ),
                    el(
                      'button',
                      {
                        type: 'button',
                        onClick: () =>
                          editor.current?.setStartingFence({
                            col: 0,
                            row: 0,
                            cols: gridCols,
                            rows: gridRows,
                          }),
                      },
                      'Whole map',
                    ),
                  )
                : null,
            )
          : null,
      ),
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
              el(
                'button',
                {
                  type: 'button',
                  class: tool === 'label' ? 'toggle on' : 'toggle',
                  'aria-pressed': tool === 'label' ? 'true' : 'false',
                  onClick: () => editor.current?.setTool('label'),
                },
                'Label',
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
            tool === 'label'
              ? el(
                  'p',
                  { class: 'frame-status' },
                  'Label: click to place a label of the chosen kind. Drag a label to move it, or its bottom-right corner to resize it. Delete removes the selected label.',
                )
              : null,
            tool !== 'select' && tool !== 'label'
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
      imported
        ? el(
            'section',
            { class: 'select-controls' },
            el('h2', null, 'Select and view'),
            el(
              'p',
              { class: 'frame-status' },
              'Drag on empty space to box-select the shapes fully inside it. Shift adds to the selection. Wheel zooms; middle-drag pans.',
            ),
            el(
              'label',
              { for: 'short-max' },
              'Shorter than ' +
                shortMax.toFixed(1) +
                ' tiles: ' +
                (editor.current?.shortCount(shortMax) ?? 0) +
                ' shapes',
            ),
            el('input', {
              id: 'short-max',
              type: 'range',
              min: 0.5,
              max: 20,
              step: 0.5,
              value: shortMax,
              onInput: (e: Event) =>
                setShortMax(
                  Number((e.currentTarget as HTMLInputElement).value),
                ),
            }),
            el(
              'div',
              { class: 'edit-row' },
              el(
                'button',
                {
                  type: 'button',
                  disabled: !editor.current,
                  onClick: () => editor.current?.selectShorterThan(shortMax),
                },
                'Select those',
              ),
              el(
                'button',
                { type: 'button', onClick: () => preview.current?.resetView() },
                'Reset zoom',
              ),
            ),
          )
        : null,
      imported
        ? el(
            'section',
            { class: 'labels' },
            el('h2', null, 'Labels'),
            el(
              'p',
              { class: 'frame-status' },
              (editor.current?.map.layers.labels.length ?? 0) +
                ' on the map. Pick one here or on the map to edit it.',
            ),
            el(
              'button',
              {
                type: 'button',
                disabled: (editor.current?.map.layers.labels.length ?? 0) === 0,
                onClick: () => editor.current?.clearLabels(),
              },
              'Remove all labels',
            ),
            el(
              'div',
              { class: 'tool-grid' },
              ...(editor.current?.map.layers.labels ?? []).map((l) =>
                el(
                  'button',
                  {
                    key: l.id,
                    type: 'button',
                    class: l.id === selectedLabelId ? 'toggle on' : 'toggle',
                    'aria-pressed': l.id === selectedLabelId ? 'true' : 'false',
                    onClick: () => editor.current?.selectLabel(l.id),
                  },
                  l.text + ' (' + l.kind + ')',
                ),
              ),
            ),
            el(
              'div',
              null,
              el('label', { for: 'label-kind' }, 'Kind'),
              el(
                'select',
                {
                  id: 'label-kind',
                  value: editor.current?.labelKindValue ?? 'park',
                  onChange: (e: Event) =>
                    editor.current?.setLabelKind(
                      (e.currentTarget as HTMLSelectElement).value as LabelKind,
                    ),
                },
                LABEL_KIND_OPTIONS.map(([kind, name]) =>
                  el('option', { key: kind, value: kind }, name),
                ),
              ),
            ),
            selectedLabel
              ? el(
                  'div',
                  null,
                  el('label', { for: 'label-text' }, 'Text'),
                  el('input', {
                    id: 'label-text',
                    type: 'text',
                    maxLength: 40,
                    value: selectedLabel.text,
                    onChange: (e: Event) =>
                      editor.current?.setLabelText(
                        (e.currentTarget as HTMLInputElement).value,
                      ),
                  }),
                  el(
                    'label',
                    { for: 'label-size' },
                    'Size: ' + selectedLabel.size.toFixed(1) + ' tiles',
                  ),
                  el('input', {
                    id: 'label-size',
                    type: 'range',
                    min: LABEL_SIZE.min,
                    max: LABEL_SIZE.max,
                    step: 0.1,
                    value: selectedLabel.size,
                    onChange: (e: Event) =>
                      editor.current?.setLabelSize(
                        Number((e.currentTarget as HTMLInputElement).value),
                      ),
                  }),
                  el(
                    'button',
                    {
                      type: 'button',
                      onClick: () => editor.current?.deleteSelectedLabel(),
                    },
                    'Delete label',
                  ),
                )
              : el(
                  'p',
                  { class: 'frame-status' },
                  'Pick a label on the map to edit its text and size. Use the Label tool to add one.',
                ),
          )
        : null,
      imported
        ? el(
            'section',
            { class: 'layers' },
            el('h2', null, 'Layers'),
            ...LAYER_NAMES.map((layer) => layerRow(editor.current, layer)),
            el(
              'label',
              { class: 'snap-toggle' },
              el('input', {
                type: 'checkbox',
                checked: editor.current?.snapping ?? true,
                onChange: (e: Event) =>
                  editor.current?.setSnapping(
                    (e.currentTarget as HTMLInputElement).checked,
                  ),
              }),
              ' Snap to grid',
            ),
            el(
              'label',
              null,
              el('input', {
                type: 'checkbox',
                checked: outlines,
                onChange: (e: Event) =>
                  setOutlines((e.currentTarget as HTMLInputElement).checked),
              }),
              ' Show edit outlines',
            ),
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
