/** A longitude and latitude in degrees, in that order. */
export type LonLat = readonly [lon: number, lat: number];

/** A Web Mercator (EPSG:3857) position in metres. */
export type Metres = readonly [x: number, y: number];

const EARTH_RADIUS_M = 6378137;
const MAX_LAT = 85.0511287798;

export function lonLatToMercator([lon, lat]: LonLat): Metres {
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const x = (EARTH_RADIUS_M * lon * Math.PI) / 180;
  const y =
    EARTH_RADIUS_M *
    Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360));
  return [x, y];
}

export function mercatorToLonLat([x, y]: Metres): LonLat {
  const lon = (x / EARTH_RADIUS_M) * (180 / Math.PI);
  const lat =
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) *
    (180 / Math.PI);
  return [lon, lat];
}
