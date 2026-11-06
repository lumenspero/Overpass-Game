import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { compileMap, trimSource } from '@overpass-game/map-compiler';
import { parseSourceMap, type SourceMap } from '@overpass-game/map-schema';

/** Map ids the game reserves for its built-in test map. An export may not overwrite it. */
export const RESERVED_MAP_IDS: readonly string[] = ['test'];

export const EXPORT_PATH = '/api/export-map';

/** Largest request body the endpoint reads, in bytes. A map with thousands of shapes is well under this. */
const MAX_BYTES = 25 * 1024 * 1024;

export interface ExportOptions {
  /** The repo's maps/ folder. */
  mapsDir: string;
  /** Where the game is served, for the Play link. */
  gameUrl: string;
}

export interface ExportResult {
  status: number;
  body: { id: string; file: string; playUrl: string } | { error: string };
}

/**
 * Validates a source map and writes it, with its compiled file, into the maps folder.
 * Writing the source as well keeps `pnpm compile-maps --check` consistent.
 */
export function exportMap(text: string, options: ExportOptions): ExportResult {
  // Each stage reports itself, and the full stack goes to the dev server's terminal, so a failure
  // can be traced to the step and the line that raised it.
  const fail = (stage: string, err: unknown): ExportResult => {
    console.error(`[map export] ${stage} failed:`, err);
    const message = err instanceof Error ? err.message : 'Invalid map.';
    return { status: 400, body: { error: `${stage} failed: ${message}` } };
  };
  let source: SourceMap;
  let compiled: string;
  try {
    // The written source is trimmed too, so maps made before trimming shrink when exported.
    source = trimSource(parseSourceMap(JSON.parse(text)));
  } catch (err) {
    return fail('Reading the map', err);
  }
  try {
    compiled = JSON.stringify(compileMap(source), null, 2) + '\n';
  } catch (err) {
    return fail('Compiling the map', err);
  }
  if (RESERVED_MAP_IDS.includes(source.id)) {
    return {
      status: 400,
      body: {
        error: `"${source.id}" is reserved for the built-in test map. Rename the map to export it.`,
      },
    };
  }
  mkdirSync(options.mapsDir, { recursive: true });
  writeFileSync(
    join(options.mapsDir, `${source.id}.map-src.json`),
    JSON.stringify(source, null, 2) + '\n',
  );
  writeFileSync(join(options.mapsDir, `${source.id}.map.json`), compiled);
  return {
    status: 200,
    body: {
      id: source.id,
      file: `maps/${source.id}.map.json`,
      playUrl: `${options.gameUrl}?map=${source.id}`,
    },
  };
}

/** Dev server only: the Studio posts the open map here to export or play it. */
export function mapExportProxy(options: ExportOptions): Plugin {
  return {
    name: 'map-export-proxy',
    configureServer(server) {
      server.middlewares.use(EXPORT_PATH, (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Allow', 'POST');
          res.end(JSON.stringify({ error: 'Use POST.' }));
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.statusCode = 413;
            res.end(
              JSON.stringify({ error: 'The map is too large to export.' }),
            );
            req.destroy();
            return;
          }
          parts.push(chunk);
        });
        req.on('end', () => {
          if (size > MAX_BYTES) return;
          const out = exportMap(Buffer.concat(parts).toString('utf8'), options);
          res.statusCode = out.status;
          res.end(JSON.stringify(out.body));
        });
      });
    },
  };
}
