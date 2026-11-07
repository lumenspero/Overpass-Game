import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DEFAULT_VIEW, STYLE_URL } from '../config.ts';
import {
  frameCornersLonLat,
  isInsideUS,
  type BBox,
  type Frame,
} from '../geo/frame.ts';
import {
  lonLatToMercator,
  mercatorToLonLat,
  type LonLat,
  type Metres,
} from '../geo/mercator.ts';
import type { PlaceCandidate } from '../search/nominatim.ts';

const FRAME_SOURCE = 'frame';
const DRAFT_SOURCE = 'draft';
const INSIDE_COLOUR = '#7fd1ff';
const OUTSIDE_COLOUR = '#e5484d';

interface Collection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: Record<string, string>;
    geometry: { type: 'Polygon'; coordinates: number[][][] };
  }[];
}

const EMPTY: Collection = { type: 'FeatureCollection', features: [] };

function polygonCollection(
  ring: readonly LonLat[],
  colour: string,
): Collection {
  const coords = [...ring, ring[0]].map(([lon, lat]) => [lon, lat]);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { colour },
        geometry: { type: 'Polygon', coordinates: [coords] },
      },
    ],
  };
}

export interface MapPanelHandlers {
  /** Called when the player finishes dragging out a frame, with two Mercator corners. */
  onFrameDrawn(start: Metres, end: Metres): void;
  /** Called when the player clicks a place marker. */
  onPickPlace(id: string): void;
}

/**
 * Real-map panel: MapLibre with the frame, candidate markers and a drag-to-draw
 * tool. It shows the state the app gives it and reports user actions.
 */
export class MapPanel {
  private readonly map: MapLibreMap;
  private readonly handlers: MapPanelHandlers;
  private readonly markers = new Map<string, Marker>();
  private loaded = false;
  private drawMode = false;
  private dragStart: Metres | null = null;
  private frame: Frame | null = null;

  constructor(container: HTMLElement, handlers: MapPanelHandlers) {
    this.handlers = handlers;
    this.map = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: DEFAULT_VIEW.centre as [number, number],
      zoom: DEFAULT_VIEW.zoom,
    });
    this.map.addControl(
      new NavigationControl({ showCompass: false }),
      'top-right',
    );
    this.map.on('load', () => this.setupLayers());
    this.map.on('mousedown', (e: MapMouseEvent) => this.onMouseDown(e));
  }

  /** Shows the frame, in red when it lies outside the US box. */
  setFrame(frame: Frame | null): void {
    this.frame = frame;
    this.renderFrame();
  }

  /** Marks each candidate; the selected one is drawn larger. */
  setCandidates(
    places: readonly PlaceCandidate[],
    selectedId: string | null,
  ): void {
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    for (const place of places) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className =
        place.id === selectedId ? 'place-marker is-selected' : 'place-marker';
      el.title = place.name;
      el.setAttribute('aria-label', place.name);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        this.handlers.onPickPlace(place.id);
      });
      const marker = new Marker({ element: el })
        .setLngLat([place.centre[0], place.centre[1]])
        .addTo(this.map);
      this.markers.set(place.id, marker);
    }
  }

  /** While on, dragging draws a frame instead of panning the map. */
  setDrawMode(on: boolean): void {
    this.drawMode = on;
    this.map.getCanvas().style.cursor = on ? 'crosshair' : '';
    if (!on) this.cancelDraw();
  }

  fitTo(bbox: BBox): void {
    this.map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 60, maxZoom: 12, duration: 600 },
    );
  }

  destroy(): void {
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    this.map.remove();
  }

  private setupLayers(): void {
    this.map.addSource(FRAME_SOURCE, { type: 'geojson', data: EMPTY });
    this.map.addSource(DRAFT_SOURCE, { type: 'geojson', data: EMPTY });
    this.map.addLayer({
      id: 'frame-fill',
      type: 'fill',
      source: FRAME_SOURCE,
      paint: { 'fill-color': ['get', 'colour'], 'fill-opacity': 0.12 },
    });
    this.map.addLayer({
      id: 'frame-line',
      type: 'line',
      source: FRAME_SOURCE,
      paint: { 'line-color': ['get', 'colour'], 'line-width': 3 },
    });
    this.map.addLayer({
      id: 'draft-line',
      type: 'line',
      source: DRAFT_SOURCE,
      paint: {
        'line-color': '#ffd166',
        'line-width': 2,
        'line-dasharray': [2, 2],
      },
    });
    this.loaded = true;
    this.renderFrame();
  }

  private renderFrame(): void {
    if (!this.loaded) return;
    const data = this.frame
      ? polygonCollection(
          frameCornersLonLat(this.frame),
          isInsideUS(this.frame) ? INSIDE_COLOUR : OUTSIDE_COLOUR,
        )
      : EMPTY;
    this.map.getSource<GeoJSONSource>(FRAME_SOURCE)?.setData(data);
  }

  private onMouseDown(e: MapMouseEvent): void {
    if (!this.drawMode) return;
    this.dragStart = lonLatToMercator([e.lngLat.lng, e.lngLat.lat]);
    this.map.dragPan.disable();
    // Follow the mouse on the window, so a release outside the map, or over a marker, still ends the drag.
    window.addEventListener('mousemove', this.dragMove);
    window.addEventListener('mouseup', this.dragEnd);
  }

  private readonly dragMove = (event: MouseEvent): void => {
    if (this.dragStart) this.setDraft(this.dragStart, this.mercatorAt(event));
  };

  private readonly dragEnd = (event: MouseEvent): void => {
    const start = this.dragStart;
    if (!start) return;
    const end = this.mercatorAt(event);
    this.cancelDraw();
    this.handlers.onFrameDrawn(start, end);
  };

  /** Converts a window mouse position to Mercator metres, even outside the map. */
  private mercatorAt(event: MouseEvent): Metres {
    const rect = this.map.getCanvas().getBoundingClientRect();
    const { lng, lat } = this.map.unproject([
      event.clientX - rect.left,
      event.clientY - rect.top,
    ]);
    return lonLatToMercator([lng, lat]);
  }

  private setDraft(a: Metres, b: Metres): void {
    const corners: Metres[] = [a, [b[0], a[1]], b, [a[0], b[1]]];
    const ring = corners.map((p) => mercatorToLonLat(p));
    this.map
      .getSource<GeoJSONSource>(DRAFT_SOURCE)
      ?.setData(polygonCollection(ring, '#ffd166'));
  }

  private cancelDraw(): void {
    this.dragStart = null;
    window.removeEventListener('mousemove', this.dragMove);
    window.removeEventListener('mouseup', this.dragEnd);
    this.map.dragPan.enable();
    this.map.getSource<GeoJSONSource>(DRAFT_SOURCE)?.setData(EMPTY);
  }
}
