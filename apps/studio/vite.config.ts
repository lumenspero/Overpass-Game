import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { nominatimProxy } from './dev/nominatim-proxy.ts';
import { overpassProxy } from './dev/overpass-proxy.ts';
import { terrainProxy } from './dev/terrain-proxy.ts';

const here = dirname(fileURLToPath(import.meta.url));

// Map Studio is a dev-only tool and is never deployed publicly.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, '');
  return {
    base: '/',
    plugins: [
      nominatimProxy(env.NOMINATIM_CONTACT),
      overpassProxy(),
      terrainProxy(),
    ],
    // MapLibre starts its worker from a file next to its own module. Vite's dependency
    // pre-bundling moves that module and leaves the worker behind, so keep MapLibre out of it.
    optimizeDeps: { exclude: ['maplibre-gl'] },
  };
});
