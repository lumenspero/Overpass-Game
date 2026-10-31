import { h, type Attributes, type ComponentChildren, type VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { SourceMap } from '@overpass-game/map-schema';
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
    map: SourceMap;
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
    return () => {
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
  const sourceForPreview =
    imported && frame && sameFrame(imported.frame, frame) ? imported.map : null;
  useEffect(() => {
    preview.current?.setSource(sourceForPreview);
  }, [sourceForPreview]);

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
      setImported({ map, frame: current, elevation });
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

  /** Runs on slider release: rebuilds the mountain layer from the stored elevation. */
  function onMountainThreshold(threshold: number): void {
    const current = imported;
    if (!current?.elevation) return;
    const mountains = deriveMountains(
      current.elevation,
      current.frame.cols,
      current.frame.rows,
      threshold,
    );
    setImported({
      ...current,
      map: {
        ...current.map,
        layers: { ...current.map.layers, mountains },
      },
    });
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
