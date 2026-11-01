import type { BBox } from '../geo/frame.ts';

/** Tags for the land and water features the import reads. Kept in one place so the query and the converter agree. */
export const PARK_LANDUSE = [
  'forest',
  'grass',
  'meadow',
  'recreation_ground',
  'village_green',
] as const;
/**
 * Waterways kept as strokes. Streams, drains and ditches are left out: they are narrower than
 * the game's roads and make the map hard to edit, so they are not part of the game's water.
 */
export const RIVER_WATERWAYS = ['river', 'canal'] as const;

/**
 * The Overpass QL for one area. The box is [west, south, east, north] in
 * degrees; Overpass wants (south, west, north, east).
 */
export function buildQuery([west, south, east, north]: BBox): string {
  const box = `(${south},${west},${north},${east})`;
  const parks = PARK_LANDUSE.join('|');
  const rivers = RIVER_WATERWAYS.join('|');
  return `[out:json][timeout:90];
(
  way["natural"="water"]${box};
  relation["natural"="water"]${box};
  relation["waterway"="riverbank"]${box};
  way["waterway"~"^(${rivers})$"]${box};
  way["natural"="coastline"]${box};
  way["highway"~"^(motorway|trunk)$"]${box};
  way["leisure"="park"]${box};
  relation["leisure"="park"]${box};
  way["landuse"~"^(${parks})$"]${box};
  relation["landuse"~"^(${parks})$"]${box};
  node["natural"="peak"]${box};
);
out geom;`;
}
