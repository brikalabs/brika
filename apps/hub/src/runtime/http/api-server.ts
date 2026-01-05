import { createApp, type RouteDefinition } from '@brika/router';
import { inject, singleton } from '@brika/shared';
import { HubConfig } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';

@singleton()
export class ApiServer {
  readonly #config = inject(HubConfig);
  readonly #logs = inject(LogRouter);
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

    this.#server = Bun.serve({
      hostname: this.#config.host,
      port: this.#config.port,
      fetch: async (req) => {
        if (!this.#app) throw new Error('Failed to start');

        const start = Date.now();
        const url = new URL(req.url);

        try {
          const res = await this.#app.fetch(req);
          const duration = Date.now() - start;

          // Skip body logging for streaming responses to avoid buffering
          const isStreaming = res.headers.get('content-type')?.includes('text/event-stream');

          this.#logs.info('api.request.end', {
            method: req.method,
            path: url.pathname,
            status: res.status,
            duration,
            ...(isStreaming ? { streaming: true } : { body: await res.clone().text() }),
          });

          return res;
        } catch (e) {
          this.#logs.error('api.error', {
            method: req.method,
            path: url.pathname,
            error: String(e),
            duration: Date.now() - start,
          });
          throw e;
        }
      },
    });
  }

  stop(): void {
    this.#server?.stop();
  }
}
