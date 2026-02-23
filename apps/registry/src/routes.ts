import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { getRegistryData } from './utils';

export function createRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  // Enable CORS for all routes
  app.use('*', cors({ origin: '*' }));

  // Health check endpoint
  app.get('/health', (c) => {
    const data = getRegistryData();
    return c.json({
      status: 'ok',
      service: 'brika-registry',
      signed: Boolean(data.signature),
      pluginCount: data.plugins.length,
    });
  });

  // Public key endpoint
  app.get('/public-key', (c) => {
    const data = getRegistryData();
    if (!data.publicKey) {
      return c.json({ error: 'No public key configured' }, 404);
    }
    return c.json({
      publicKey: data.publicKey,
      format: 'base64-raw-ed25519',
    });
  });

  // Serve verified plugins list
  app.get('/verified-plugins.json', (c) => {
    try {
      const data = getRegistryData();

      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', `public, max-age=${c.env.CACHE_MAX_AGE}`);

      return c.json(data, { headers });
    } catch (err) {
      return c.json({ error: 'Failed to load registry', message: String(err) }, 500);
    }
  });

  // Root endpoint - redirect to verified plugins
  app.get('/', (c) => {
    return c.redirect('/verified-plugins.json');
  });

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
  });

  return app;
}
