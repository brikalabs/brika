import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import {
  buildFullPath,
  CDN_URLS,
  fetchPackageMetadata,
  getStableVersions,
  parseVersion,
  sortVersions,
} from './utils';

export function createRoutes() {
  const app = new Hono<{
    Bindings: Env;
  }>();

  app.use(
    '*',
    cors({
      origin: '*',
    })
  );

  // Versions list
  app.get('/versions.json', async (c) => {
    const meta = await fetchPackageMetadata(c.env.NPM_PACKAGE);
    if (!meta) {
      return c.json(
        {
          error: 'Package not found',
        },
        404
      );
    }

    const versions = sortVersions(getStableVersions(meta));
    return c.json({
      package: c.env.NPM_PACKAGE,
      versions,
      latest: versions[0] || meta['dist-tags']?.latest || null,
    });
  });

  // File proxy (specific, range, latest)
  app.get('*', async (c) => {
    const { version, path } = await parseVersion(c.req.path, c.env.NPM_PACKAGE);

    if (!path?.trim()) {
      return c.json(
        {
          error: 'File path required',
        },
        400
      );
    }

    const buildUrl = CDN_URLS[c.env.CDN_PROVIDER];
    if (!buildUrl) {
      return c.json(
        {
          error: 'Invalid CDN provider',
        },
        500
      );
    }

    const cdnUrl = buildUrl(c.env.NPM_PACKAGE, version, buildFullPath(c.env.SCHEMAS_PATH, path));

    try {
      const res = await fetch(cdnUrl);
      if (!res.ok) {
        return c.json(
          {
            error: 'File not found',
            url: cdnUrl,
          },
          404
        );
      }

      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', `public, max-age=${c.env.CACHE_MAX_AGE}`);

      return new Response(res.body, {
        headers,
      });
    } catch (err) {
      return c.json(
        {
          error: 'CDN fetch failed',
          message: String(err),
        },
        502
      );
    }
  });

  return app;
}
