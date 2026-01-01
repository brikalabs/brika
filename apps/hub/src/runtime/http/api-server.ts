import { singleton, inject } from "@elia/shared";
import { createApp } from "@elia/router";
import { allRoutes } from "./routes";
import { HubConfig } from "../config";

@singleton()
export class ApiServer {
  readonly #config = inject(HubConfig);
  readonly #app = createApp(allRoutes);
  #server?: ReturnType<typeof Bun.serve>;

  get port(): number {
    return this.#server?.port ?? this.#config.port;
  }

  async start(): Promise<void> {
    this.#server = Bun.serve({
      hostname: this.#config.host,
      port: this.#config.port,
      fetch: this.#app.fetch,
    });
  }

  async stop(): Promise<void> {
    this.#server?.stop();
  }
}
