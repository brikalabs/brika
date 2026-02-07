import { inject, singleton } from '@brika/di';
import { createApp, type RouteDefinition } from '@brika/router';
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
    this.#setupStaticFiles();

    this.#server = Bun.serve({
      hostname: this.#config.host,
      port: this.#config.port,
      fetch: (req) => this.#handleRequest(req),
    });
  }

  stop(): void {
    this.#server?.stop();
  }

  async #handleRequest(req: Request): Promise<Response> {
    if (!this.#app) throw new Error('Server not initialized');

    const start = performance.now();
    const res = await this.#app.fetch(req);
    const duration = formatDuration(performance.now() - start);
    const url = new URL(req.url);
    const path = url.pathname;
    const query = Object.fromEntries(url.searchParams);

    this.#logs.info(`${req.method} ${path} → ${res.status} (${duration})`, {
      method: req.method,
      path,
      status: res.status,
      duration,
      ...(Object.keys(query).length > 0 && { query }),
    });

    return res;
  }

  #setupStaticFiles(): void {
    const { staticDir } = this.#config;
    if (!staticDir) return;

    this.#app?.use('/*', serveStatic({ root: staticDir }));
    this.#app?.get('*', serveStatic({ root: staticDir, path: 'index.html' }));
    this.#logs.info('Static file serving enabled', { directory: staticDir });
  }
}
