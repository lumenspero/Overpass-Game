import type { Plugin } from 'vite';

/** Dev-server path that the browser calls. The Studio never calls Nominatim directly. */
export const NOMINATIM_PATH = '/nominatim';

const UPSTREAM = 'https://nominatim.openstreetmap.org';
const APP_NAME = 'Overpass_Game-Studio/0.0.0';

/**
 * Builds the User-Agent that Nominatim's usage policy asks for: the app name
 * and a contact. Returns null when no usable contact is set, so the proxy
 * refuses to call the service rather than sending an anonymous request.
 */
export function nominatimUserAgent(contact: string | undefined): string | null {
  const value = contact?.trim() ?? '';
  if (value === '') return null;
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const isUrl = /^https?:\/\/\S+$/.test(value);
  if (!isEmail && !isUrl) return null;
  return `${APP_NAME} (${value})`;
}

/**
 * Dev-only proxy for Nominatim search. Browsers can't set a User-Agent, so the
 * dev server adds it. Only the /search endpoint is forwarded.
 */
export function nominatimProxy(contact: string | undefined): Plugin {
  const userAgent = nominatimUserAgent(contact);

  return {
    name: 'overpass-nominatim-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(NOMINATIM_PATH, async (req, res) => {
        const send = (status: number, body: unknown): void => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        if (!userAgent) {
          send(503, {
            error:
              'Set NOMINATIM_CONTACT in apps/studio/.env.local to an email address or URL, then restart the Studio.',
          });
          return;
        }
        if (req.method !== 'GET') {
          send(405, { error: 'Only GET is allowed.' });
          return;
        }
        // Connect strips the mount path, so req.url is e.g. "/search?q=...".
        if (!(req.url ?? '').startsWith('/search?')) {
          send(404, { error: 'Only the search endpoint is proxied.' });
          return;
        }

        try {
          const upstream = await fetch(
            `${UPSTREAM}/search${(req.url ?? '').slice('/search'.length)}`,
            {
              headers: {
                'User-Agent': userAgent,
                Accept: 'application/json',
                'Accept-Language': 'en',
              },
            },
          );
          res.statusCode = upstream.status;
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') ?? 'application/json',
          );
          res.end(await upstream.text());
        } catch (err) {
          send(502, {
            error: `Nominatim could not be reached: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      });
    },
  };
}
