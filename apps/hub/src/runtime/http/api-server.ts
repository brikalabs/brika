import { singleton, inject } from "@elia/shared";
import { createApp } from "@elia/router";
import { allRoutes } from "./routes";
import { HubConfig } from "../config";
import { LogRouter } from "../logs/log-router";

@singleton()
export class ApiServer {
  readonly #config = inject(HubConfig);
  readonly #logs = inject(LogRouter);
  readonly #app = createApp(allRoutes);
  #server?: ReturnType<typeof Bun.serve>;

  get port(): number {
    return this.#server?.port ?? this.#config.port;
  }

  async start(): Promise<void> {
    this.#server = Bun.serve({
      hostname: this.#config.host,
      port: this.#config.port,
      fetch: async (req) => {
        const start = Date.now();
        const url = new URL(req.url);

        try {
          const res = await this.#app.fetch(req);
          const duration = Date.now() - start;

          // Log API requests (skip SSE streams and static assets)
          if (!url.pathname.startsWith("/api/stream") && url.pathname.startsWith("/api")) {
            this.#logs.info("api.request", {
              method: req.method,
              path: url.pathname,
              status: res.status,
              duration,
            });
          }

          return res;
        } catch (e) {
          const duration = Date.now() - start;
          this.#logs.error("api.error", {
            method: req.method,
            path: url.pathname,
            error: String(e),
            duration,
          });
          throw e;
        }
      },
    });
  }

  async stop(): Promise<void> {
    this.#server?.stop();
  }
}
