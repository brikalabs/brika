import { inject, singleton } from '@brika/di';
import {
  type CorsOriginMatcher,
  createApp,
  type Middleware,
  type RouteDefinition,
} from '@brika/router';
import { serveStatic } from 'hono/bun';
import { HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { hostAllowlist } from './middleware/host-allowlist';

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
    const middleware: Middleware[] = [hostAllowlist({ allowed: this.#allowedHosts() })];
    middleware.push(...this.#middleware);

    this.#app = createApp(this.#routes, middleware, {
      cors: this.#corsAllowlist(),
    });
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

  /**
   * In-process request dispatch. Bypasses the socket and runs the request
   * directly through the Hono app. Used by the remote-access RPC bridge to
   * serve WebRTC data-channel requests without a TCP round-trip.
   *
   * The caller is responsible for setting the canonical `Host` header,
   * `x-real-ip`, and any other context the underlying middleware needs.
   */
  async fetchInternal(req: Request): Promise<Response> {
    if (!this.#app) {
      throw new Error('Server not initialized');
    }
    return await this.#app.fetch(req);
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

  /**
   * Hostnames accepted in the `Host` request header. Loopback and private
   * network ranges are always allowed by the middleware; we additionally list
   * the configured bind host (when it's a real DNS name) and the remote-access
   * public hostname (e.g. `maxime.brika.dev`).
   */
  #allowedHosts(): string[] {
    const hosts: string[] = [];
    if (this.#config.host && this.#config.host !== '0.0.0.0' && this.#config.host !== '::') {
      hosts.push(`${this.#config.host}:${this.#config.port}`, this.#config.host);
    }
    const { publicOrigin } = this.#config.remoteAccess;
    if (publicOrigin) {
      try {
        const url = new URL(publicOrigin);
        hosts.push(url.host);
      } catch {
        // Invalid URL — ignore, host allowlist will fall back to loopback/private only.
      }
    }
    return hosts;
  }

  /**
   * CORS origin allowlist. Always allows the configured public remote origin
   * (so the static `*.brika.dev` UI shell can call the hub during signaling
   * bootstrap), the LAN HTTP origin, and any loopback/private-network origin
   * (covering Vite dev, mDNS, and other LAN access). External origins are
   * blocked to prevent cross-site credential theft.
   */
  #corsAllowlist(): CorsOriginMatcher {
    const matchers: Array<string | RegExp | ((origin: string) => boolean)> = [];
    const { publicOrigin } = this.#config.remoteAccess;
    if (publicOrigin) {
      matchers.push(publicOrigin);
    }
    matchers.push((origin: string) => {
      try {
        const url = new URL(origin);
        const host = url.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
          return true;
        }
        if (host.endsWith('.local')) {
          return true;
        }
        if (host.startsWith('10.') || host.startsWith('192.168.')) {
          return true;
        }
        if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
          return true;
        }
        if (host.startsWith('169.254.')) {
          return true;
        }
        return false;
      } catch {
        return false;
      }
    });
    return matchers;
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
