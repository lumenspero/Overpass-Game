/**
 * Development-only switches, for testing. Each one is forced off in a production build, because
 * `import.meta.env.DEV` is false there. Set a flag to `true` and reload the dev server to use it.
 */
export const DEV_FLAGS = {
  /** Opens every campaign map on the map select, so the layout of all the cards can be checked. */
  showAllMaps: import.meta.env.DEV && true,
};
