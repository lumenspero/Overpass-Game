import type { Plugin } from 'vite';

/** Dev-server path that the browser calls. The Studio never calls the tile host directly. */
export const TERRAIN_PATH = '/terrain';

const UPSTREAM = 'https://elevation-tiles-prod.s3.amazonaws.com';
const USER_AGENT = 'Overpass_Game-Studio/0.0.0';

/** Highest zoom the proxy will ask for. Terrarium tiles are published up to zoom 15. */
const MAX_ZOOM = 15;

const TILE_PATH = /^\/terrarium\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.png$/;

export interface TileRequest {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

export interface ProxyRefusal {
  readonly status: number;
  readonly error: string;
}

/** Reads a tile path such as /terrarium/10/238/401.png. Returns null when it is not a real tile. */
export function parseTileUrl(url: string | undefined): TileRequest | null {
  const match = TILE_PATH.exec(url ?? '');
  if (!match) return null;
  const z = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  if (z > MAX_ZOOM) return null;
  const count = 2 ** z;
  if (x >= count || y >= count) return null;
  return { z, x, y };
}

/** Decides whether a request may be forwarded. Returns null when it may. */
export function checkTerrainRequest(
  method: string | undefined,
  url: string | undefined,
): ProxyRefusal | null {
  if (method !== 'GET') return { status: 405, error: 'Only GET is allowed.' };
  if (parseTileUrl(url) === null)
    return { status: 404, error: 'Only Terrarium tiles are proxied.' };
  return null;
}

/**
 * Dev-only proxy for Terrarium elevation tiles. It adds the Studio's User-Agent
 * and forwards only valid tile paths.
 */
export function terrainProxy(): Plugin {
  return {
    name: 'terrain-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(TERRAIN_PATH, async (req, res) => {
        const send = (status: number, body: unknown): void => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        const refusal = checkTerrainRequest(req.method, req.url);
        const tile = parseTileUrl(req.url);
        if (refusal !== null || tile === null) {
          send(refusal?.status ?? 404, {
            error: refusal?.error ?? 'Only Terrarium tiles are proxied.',
          });
          return;
        }

        try {
          const upstream = await fetch(
            `${UPSTREAM}/terrarium/${tile.z}/${tile.x}/${tile.y}.png`,
            { headers: { 'User-Agent': USER_AGENT, Accept: 'image/png' } },
          );
          res.statusCode = upstream.status;
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') ?? 'image/png',
          );
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
          send(502, {
            error: `Terrain tiles could not be reached: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      });
    },
  };
}
