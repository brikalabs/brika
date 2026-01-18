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
    return c.json({ status: 'ok', service: 'brika-registry' });
  });

  // Serve verified plugins list
  app.get('/verified-plugins.json', async (c) => {
    try {
      const data = await getRegistryData();

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
