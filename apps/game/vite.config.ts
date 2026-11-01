import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';

// Maps the Studio exports live in the repo's maps/ folder. In development this serves them
// at maps/<id>.map.json so that ?map=<id> can load them. A production build does not include them.
const mapsDir = fileURLToPath(new URL('../../maps/', import.meta.url));
const MAP_FILE = /^\/maps\/([a-z0-9-]+\.map\.json)$/;

function serveMaps(): Plugin {
  return {
    name: 'serve-studio-maps',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const match = MAP_FILE.exec((req.url ?? '').split('?')[0] ?? '');
        if (!match) return next();
        const file = join(mapsDir, match[1] ?? '');
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        createReadStream(file).pipe(res);
      });
    },
  };
}

// Relative base so the built folder works from itch.io's zip upload
// and from any sub-path on Cloudflare.
export default defineConfig({
  base: './',
  plugins: [serveMaps()],
  test: {
    // Unit tests sit beside the code in src/. tests/ holds Playwright specs.
    include: ['src/**/*.test.ts'],
  },
});
