import { inject, singleton } from '@brika/di';
import { BrikaError, brikaErrorToResponse } from '@brika/ipc';
import {
  type CorsOriginMatcher,
  createApp,
  type Middleware,
  type RouteDefinition,
} from '@brika/router';
import { serveStatic } from 'hono/bun';
import { HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import {
  devUiProxyMiddleware,
  type ProxyWsData,
  proxyWebSocketHandlers,
  proxyWebSocketUpgrade,
} from './dev-ui-proxy';
import { embeddedUi, embeddedUiAvailable } from './embedded-ui';
import { hostAllowlist } from './middleware/host-allowlist';

function formatDuration(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`;
}

/**
 * CORS check for the canonical Brika coordinator host over HTTPS — the
 * public UI shell used when accessing the hub remotely is served from
 * `hub.brika.dev` and proxies requests back via the WebRTC data channel.
 */
export function isBrikaSubdomainOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === 'hub.brika.dev') {
      return url.protocol === 'https:';
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * CORS check for loopback + RFC1918 + link-local + mDNS origins. Covers
 * everything a developer or LAN device would legitimately use to reach
 * the hub.
 */
export function isPrivateNetworkOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    // URL parser preserves the surrounding brackets on IPv6 hostnames, so
    // the loopback form to match against is `[::1]`, not `::1`.
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
      return true;
    }
    if (host.endsWith('.local')) {
      return true;
    }
    // Anchored IPv4 patterns — `host.startsWith('10.')` would otherwise let
    // attacker-controlled names like `10.0.0.1.evil.com` pass and defeat the
    // LAN CORS allowlist (nip.io / sslip.io make this free public infra).
    if (/^10(?:\.\d{1,3}){3}$/.test(host)) {
      return true;
    }
    if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) {
      return true;
    }
    if (/^172\.(1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host)) {
      return true;
    }
    if (/^169\.254(?:\.\d{1,3}){2}$/.test(host)) {
      return true;
    }
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10). URL().hostname
    // keeps the surrounding brackets on IPv6 literals, matching the existing
    // `[::1]` shape above.
    if (host.startsWith('[fc') || host.startsWith('[fd')) {
      return true;
    }
    if (/^\[fe[89ab]/.test(host)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
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

    this.#server = Bun.serve<ProxyWsData>({
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
        // Dev-mode WebSocket proxy. When `BRIKA_DEV_UI_PROXY` is set and the
        // request is an upgrade for a non-`/api/*` path, pipe it to the
        // upstream dev server (Vite). This keeps HMR's WebSocket working.
        const proxy = this.#config.devUiProxy;
        if (
          proxy &&
          req.headers.get('upgrade')?.toLowerCase() === 'websocket' &&
          !new URL(req.url).pathname.startsWith('/api/')
        ) {
          return proxyWebSocketUpgrade(req, server, proxy, (msg, ctx) => this.#logs.warn(msg, ctx));
        }
        return this.#handleRequest(req);
      },
      websocket: proxyWebSocketHandlers,
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
      const response = brikaErrorToResponse(error);
      const duration = formatDuration(performance.now() - start);
      const code = error instanceof BrikaError ? error.code : 'INTERNAL';
      this.#logs.error(`${req.method} ${path} → ${response.status} (${duration})`, {
        method: req.method,
        path,
        duration,
        status: response.status,
        code,
        error: error instanceof Error ? error.message : String(error),
      });
      return response;
    }
  }

  /**
   * Hostnames accepted in the `Host` request header. Loopback and private
   * network ranges are always allowed by the middleware; we additionally
   * accept the configured bind host (when it's a real DNS name) and any
   * `*.brika.dev` subdomain — the data-channel transport always sets the
   * canonical hub host and the underlying RPC carries its own auth.
   */
  #allowedHosts(): string[] {
    const hosts: string[] = [];
    if (this.#config.host && this.#config.host !== '0.0.0.0' && this.#config.host !== '::') {
      hosts.push(`${this.#config.host}:${this.#config.port}`, this.#config.host);
    }
    return hosts;
  }

  /**
   * CORS origin allowlist. Allows: any `*.brika.dev` subdomain (the static
   * UI shell when accessed remotely), the LAN HTTP origin, and any
   * loopback/private-network origin (covering Vite dev, mDNS, and other LAN
   * access). External origins are blocked to prevent cross-site credential
   * theft.
   */
  #corsAllowlist(): CorsOriginMatcher {
    return [isBrikaSubdomainOrigin, isPrivateNetworkOrigin];
  }

  #setupStaticFiles(): void {
    // Precedence:
    //   1. BRIKA_DEV_UI_PROXY  — dev only, forward to Vite
    //   2. BRIKA_STATIC_DIR    — serve from a directory on disk
    //   3. Embedded archive    — bytes baked into the binary at build time
    if (this.#config.devUiProxy) {
      this.#app?.use(
        '/*',
        devUiProxyMiddleware(this.#config.devUiProxy, (msg, ctx) => this.#logs.warn(msg, ctx))
      );
      this.#logs.info('UI served by dev proxy', { target: this.#config.devUiProxy });
      return;
    }

    const { staticDir } = this.#config;
    if (staticDir) {
      this.#setupStaticDir(staticDir);
      return;
    }

    // Fall back to the UI baked into the binary. The handler is lazy: it
    // doesn't load the archive until the first request, so dev startups
    // where the bundle wasn't built skip the cost entirely.
    this.#app?.use('/*', embeddedUi());
    // Log immediately so the operator knows which UI source is active.
    // The archive's presence is checked async (it lives inside the
    // binary) — when the check resolves, follow up with whether the
    // archive actually exists, since serving an outdated/missing
    // archive in dev is the usual "why am I seeing an old UI?" trap.
    this.#logs.info('UI served by embedded archive (compiled-binary fallback)', {
      hint: 'set BRIKA_DEV_UI_PROXY=http://localhost:5173 to use a live Vite dev server',
    });
    void embeddedUiAvailable().then((ok) => {
      this.#logs.info('Embedded UI archive availability', { available: ok });
    });
  }

  #setupStaticDir(staticDir: string): void {
    this.#app?.use('/*', serveStatic({ root: staticDir }));
    // SPA fallback — only for non-API paths to avoid intercepting API routes.
    const spaFallback = serveStatic({ root: staticDir, path: 'index.html' });
    this.#app?.get('*', (c, next) => {
      if (c.req.path.startsWith('/api/')) {
        return next();
      }
      return spaFallback(c, next);
    });
    this.#logs.info('UI served from static directory', {
      directory: staticDir,
    });
  }
}
