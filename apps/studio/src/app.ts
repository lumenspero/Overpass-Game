import { h, type Attributes, type ComponentChildren, type VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_FRAME_TILES } from './config.ts';
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
import { MapPanel } from './map/map-panel.ts';
import { PreviewCanvas } from './preview/preview-canvas.ts';
import { searchPlaces, type PlaceCandidate } from './search/nominatim.ts';

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

/** The Studio's first screen: place search, the real map, the frame and the game-style preview. */
export function App(): VNode {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<PlaceCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  function onRotate(deg: number): void {
    setFrame((prev) => (prev ? withRotation(prev, deg) : prev));
  }

  const turn = frame?.rotationDeg ?? 0;

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
