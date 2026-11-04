/**
 * Icons for the weekly offer popup and inventory dock. Solid single-colour glyphs on a 48-unit
 * grid, set with currentColor. Holes are cut from the shape, so they read on the cream disc and
 * when grayed out in the dock. The markup is written here, never taken from the player.
 */

export const OFFER_ICONS = {
  motorway: `<path fill="currentColor" fill-rule="evenodd" d="M18 5h12l13 39H5zM23.2 9h1.6l.3 5h-2.2zM22.7 18.5h2.6l.4 7.5h-3.4zM22.1 30.5h3.8l.5 10h-4.8z"/>`,
  bridge: `<path fill="currentColor" d="M3 27h42v5H3zM10 32h5v12h-5zM33 32h5v12h-5z"/><path d="M8 27Q24 3 40 27" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M16 19.5V27M24 16.5V27M32 19.5V27" stroke="currentColor" stroke-width="2.6"/>`,
  roundabout: `<path d="M21.48 38.28A14.5 14.5 0 0 0 37.25 29.9M12.89 14.68A14.5 14.5 0 0 0 12.27 32.52M37.63 19.04A14.5 14.5 0 0 0 22.48 9.58" fill="none" stroke="currentColor" stroke-width="6"/><path d="M39.95 23.17L42.7 32.38L31.58 27.88zM16.74 38.23L7.39 36.01L16.85 28.62zM15.31 10.6L21.9 3.61L23.57 15.5z" fill="currentColor"/>`,
  tunnel: `<path fill="currentColor" fill-rule="evenodd" d="M2 43L17 14l6.5 8.5L30.5 9 46 43zM15.5 43v-7.5a8.5 8.5 0 0 1 17 0V43z"/>`,
  lights: `<path fill="currentColor" fill-rule="evenodd" d="M20 3h8a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6zM19.5 13a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0zM19.5 24a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0zM19.5 35a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0z"/>`,
  tiles: `<path fill="currentColor" fill-rule="evenodd" d="M24 5l20 10-20 10L4 15zM10 14h5v2h-5zM21.5 14h5v2h-5zM33 14h5v2h-5z"/><path fill="currentColor" d="M4 20.5l20 10 20-10v4.5l-20 10L4 25zM4 30l20 10 20-10v4.5l-20 10L4 34.5z"/>`,
} as const;

/** Stacked road tiles, also used in the tile-count badge. */
export const TILE_ICON = `<path fill="currentColor" fill-rule="evenodd" d="M24 5l20 10-20 10L4 15zM10 14h5v2h-5zM21.5 14h5v2h-5zM33 14h5v2h-5z"/><path fill="currentColor" d="M4 20.5l20 10 20-10v4.5l-20 10L4 25zM4 30l20 10 20-10v4.5l-20 10L4 34.5z"/>`;

export const EYE_ICON = `<path fill="currentColor" fill-rule="evenodd" d="M2 24C8 13.5 15.5 9 24 9s16 4.5 22 15c-6 10.5-13.5 15-22 15S8 34.5 2 24zM15 24a9 9 0 1 0 18 0a9 9 0 1 0 -18 0z"/><circle cx="24" cy="24" r="4.5" fill="currentColor"/>`;

export const CARD_ICON = `<rect x="5" y="11" width="17" height="26" rx="3.5" fill="currentColor"/><rect x="26" y="11" width="17" height="26" rx="3.5" fill="currentColor"/>`;

/** An icon in an <svg> of the given pixel size. The body must be one of the constants above. */
export function svgIcon(body: string, size: number): string {
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}
