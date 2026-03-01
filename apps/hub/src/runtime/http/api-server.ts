import { inject, singleton } from '@brika/di';
import { createApp, type Middleware, type RouteDefinition } from '@brika/router';
import { serveStatic } from 'hono/bun';
import { HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';

function formatDuration(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`;
}

@singleton()
export class ApiServer {
  readonly #config = inject(HubConfig);
  readonly #logs = inject(Logger).withSource('http');
  readonly #routes: RouteDefinition[] = [];
  readonly #middleware: Middleware[] = [];
  #app?: ReturnType<typeof createApp>;
  #server?: ReturnType<typeof Bun.serve>;

  get port(): number {
    return this.#server?.port ?? this.#config.port;
  }

  addRoutes(routes: RouteDefinition[]): void {
    this.#routes.push(...routes);
  }

  addMiddleware(middleware: Middleware): void {
    this.#middleware.push(middleware);
  }

  start(): void {
    this.#app = createApp(this.#routes, this.#middleware);
    this.#setupStaticFiles();

    this.#server = Bun.serve({
      hostname: this.#config.host,
      port: this.#config.port,
      fetch: (req, server) => {
        // Always use the real socket IP — don't trust client-supplied proxy headers
        // on direct connections. A reverse proxy should be the only source of these.
        const addr = server.requestIP(req);
        if (addr) {
          req.headers.delete('x-forwarded-for');
          req.headers.set('x-real-ip', addr.address);
        }
        return this.#handleRequest(req);
      },
    });
  }

  stop(): void {
    this.#server?.stop();
  }

  async #handleRequest(req: Request): Promise<Response> {
    if (!this.#app) {
      throw new Error('Server not initialized');
    }

    const start = performance.now();
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      const res = await this.#app.fetch(req);
      const duration = formatDuration(performance.now() - start);
      const query = Object.fromEntries(url.searchParams);

      this.#logs.info(`${req.method} ${path} → ${res.status} (${duration})`, {
        method: req.method,
        path,
        status: res.status,
        duration,
        ...(Object.keys(query).length > 0 && {
          query,
        }),
      });

      return res;
    } catch (error) {
      const duration = formatDuration(performance.now() - start);
      this.#logs.error(`${req.method} ${path} → 500 (${duration})`, {
        method: req.method,
        path,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      return Response.json(
        {
          error: 'Internal server error',
        },
        {
          status: 500,
        }
      );
    }
  }

  #setupStaticFiles(): void {
    const { staticDir } = this.#config;
    if (!staticDir) {
      return;
    }

    this.#app?.use(
      '/*',
      serveStatic({
        root: staticDir,
      })
    );

    // SPA fallback — only for non-API paths to avoid intercepting API routes
    const spaFallback = serveStatic({
      root: staticDir,
      path: 'index.html',
    });
    this.#app?.get('*', (c, next) => {
      if (c.req.path.startsWith('/api/')) {
        return next();
      }
      return spaFallback(c, next);
    });

    this.#logs.info('Static file serving enabled', {
      directory: staticDir,
    });
  }
}
