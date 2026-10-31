import type { Plugin } from 'vite';

/** Dev-server path that the browser calls. The Studio never calls Overpass directly. */
export const OVERPASS_PATH = '/overpass';

const UPSTREAM = 'https://overpass-api.de';
const USER_AGENT = 'Overpass_Game-Studio/0.0.0';

/** Queries are short text. Anything bigger is refused before it reaches the server. */
export const MAX_QUERY_BYTES = 16 * 1024;

export interface ProxyRefusal {
  readonly status: number;
  readonly error: string;
}

/** Decides whether a request may be forwarded. Returns null when it may. */
export function checkOverpassRequest(
  method: string | undefined,
  url: string | undefined,
  bytes: number,
): ProxyRefusal | null {
  if (method !== 'POST') return { status: 405, error: 'Only POST is allowed.' };
  if (url !== '/api/interpreter')
    return { status: 404, error: 'Only the interpreter endpoint is proxied.' };
  if (bytes > MAX_QUERY_BYTES)
    return { status: 413, error: 'The query is too large.' };
  return null;
}

/**
 * Dev-only proxy for the Overpass interpreter. It adds the User-Agent that the
 * Overpass usage policy asks for, and forwards only the interpreter endpoint.
 */
export function overpassProxy(): Plugin {
  return {
    name: 'overpass-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(OVERPASS_PATH, async (req, res) => {
        const send = (status: number, body: unknown): void => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        const refusal = checkOverpassRequest(
          req.method,
          req.url,
          Number(req.headers['content-length'] ?? 0),
        );
        if (refusal) {
          send(refusal.status, { error: refusal.error });
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of req) {
          total += (chunk as Buffer).length;
          if (total > MAX_QUERY_BYTES) {
            send(413, { error: 'The query is too large.' });
            return;
          }
          chunks.push(chunk as Buffer);
        }

        try {
          const upstream = await fetch(`${UPSTREAM}/api/interpreter`, {
            method: 'POST',
            headers: {
              'User-Agent': USER_AGENT,
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body: Buffer.concat(chunks),
          });
          res.statusCode = upstream.status;
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') ?? 'application/json',
          );
          res.end(await upstream.text());
        } catch (err) {
          send(502, {
            error: `Overpass could not be reached: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      });
    },
  };
}
