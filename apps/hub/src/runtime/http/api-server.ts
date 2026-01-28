import { inject, singleton } from '@brika/di';
import { createApp, type RouteDefinition } from '@brika/router';
import { serveStatic } from 'hono/bun';
import { HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';

@singleton()
export class ApiServer {
  readonly #config = inject(HubConfig);
  readonly #logs = inject(Logger).withSource('http');
  readonly #routes: RouteDefinition[] = [];
  #app?: ReturnType<typeof createApp>;
  #server?: ReturnType<typeof Bun.serve>;

  get port(): number {
    return this.#server?.port ?? this.#config.port;
  }

  addRoutes(routes: RouteDefinition[]): void {
    this.#routes.push(...routes);
  }

  start(): void {
    this.#app = createApp(this.#routes);

    // Log exceptions with full stack traces
    this.#app.onError((err, c) => {
      this.#logs.error(
        'Route handler error',
        {
          method: c.req.method,
          path: new URL(c.req.url).pathname,
        },
        { error: err }
      );
      throw err;
    });

    // Add static file serving if configured (for production Docker)
    if (this.#config.staticDir) {
      const staticDir = this.#config.staticDir;

      // Serve static files from the configured directory
      this.#app.use('/*', serveStatic({ root: staticDir }));

      // SPA fallback: serve index.html for non-API routes that don't match static files
      this.#app.get('*', serveStatic({ root: staticDir, path: 'index.html' }));

      this.#logs.info('Static file serving enabled', {
        directory: staticDir,
      });
    }

    this.#server = Bun.serve({
      hostname: this.#config.host,
      port: this.#config.port,
      fetch: async (req) => {
        if (!this.#app) throw new Error('Failed to start');

        const start = Date.now();
        const res = await this.#app.fetch(req);

        this.#logs.info('HTTP request', {
          method: req.method,
          path: new URL(req.url).pathname,
          status: res.status,
          durationMs: Date.now() - start,
        });

        return res;
      },
    });
  }

  stop(): void {
    this.#server?.stop();
  }
}
