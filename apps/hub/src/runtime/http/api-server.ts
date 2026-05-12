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

/**
 * Per-WebSocket state stored on Bun's server-managed `ws.data`. The proxy
 * needs the outbound WebSocket handle to forward messages each way.
 */
interface ProxyWsData {
  outbound: WebSocket;
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
        // Dev-mode WebSocket proxy. When the request is an upgrade for any
        // non-`/api/*` path AND `BRIKA_DEV_UI_PROXY` is set, pipe it to the
        // upstream dev server (Vite). This keeps HMR's WebSocket working
        // when developers open `localhost:7878` through the hub instead of
        // `localhost:5173` directly.
        if (
          this.#config.devUiProxy &&
          req.headers.get('upgrade')?.toLowerCase() === 'websocket' &&
          !new URL(req.url).pathname.startsWith('/api/')
        ) {
          return this.#proxyWebSocketUpgrade(req, server);
        }
        return this.#handleRequest(req);
      },
      websocket: {
        open: (ws) => {
          const outbound = ws.data.outbound;
          outbound.addEventListener('message', (ev) => {
            try {
              if (typeof ev.data === 'string') {
                ws.send(ev.data);
              } else if (ev.data instanceof ArrayBuffer) {
                ws.send(new Uint8Array(ev.data));
              }
            } catch {
              /* downstream peer already closed */
            }
          });
          outbound.addEventListener('close', (ev) => {
            try {
              ws.close(ev.code || 1000, ev.reason);
            } catch {
              /* already closed */
            }
          });
          outbound.addEventListener('error', () => {
            try {
              ws.close(1011, 'upstream errored');
            } catch {
              /* already closed */
            }
          });
        },
        message: (ws, message) => {
          const out = ws.data.outbound;
          if (out.readyState === WebSocket.OPEN) {
            out.send(message as string | Uint8Array);
          } else if (out.readyState === WebSocket.CONNECTING) {
            out.addEventListener('open', () => out.send(message as string | Uint8Array), {
              once: true,
            });
          }
        },
        close: (ws) => {
          try {
            ws.data.outbound.close();
          } catch {
            /* already closed */
          }
        },
      },
    });
  }

  /**
   * Open an outbound WebSocket to the dev UI proxy target, wait for it to be
   * ready, then upgrade the inbound request. Returning `undefined` from a
   * Bun.serve fetch handler tells Bun the response is being driven by the
   * upgrade machinery — Bun emits the 101.
   */
  async #proxyWebSocketUpgrade(
    req: Request,
    server: Bun.Server<ProxyWsData>
  ): Promise<Response | undefined> {
    const targetBase = this.#config.devUiProxy;
    if (!targetBase) {
      return new Response('Dev proxy not configured', { status: 500 });
    }
    const sourceUrl = new URL(req.url);
    const targetUrl = new URL(targetBase);
    targetUrl.pathname = sourceUrl.pathname;
    targetUrl.search = sourceUrl.search;
    targetUrl.protocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    const protocols = req.headers
      .get('sec-websocket-protocol')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let outbound: WebSocket;
    try {
      outbound = new WebSocket(targetUrl.toString(), protocols);
    } catch (err) {
      this.#logs.warn('Dev UI WS proxy failed to dial upstream', {
        target: targetUrl.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
      return new Response('Bad upstream', { status: 502 });
    }

    const opened = await new Promise<boolean>((resolve) => {
      const onOpen = (): void => {
        cleanup();
        resolve(true);
      };
      const onError = (): void => {
        cleanup();
        resolve(false);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 3000);
      function cleanup(): void {
        outbound.removeEventListener('open', onOpen);
        outbound.removeEventListener('error', onError);
        clearTimeout(timer);
      }
      outbound.addEventListener('open', onOpen);
      outbound.addEventListener('error', onError);
    });

    if (!opened) {
      try {
        outbound.close();
      } catch {
        /* fine */
      }
      return new Response('Upstream WebSocket did not open in time', { status: 504 });
    }

    const upgraded = server.upgrade(req, { data: { outbound } });
    if (!upgraded) {
      try {
        outbound.close();
      } catch {
        /* fine */
      }
      return new Response('Upgrade failed', { status: 426 });
    }
    return undefined;
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
    // Dev override takes precedence: forward everything that isn't /api/*
    // to a Vite (or similar) dev server so UI changes show up without a
    // rebuild cycle. Used by the root `bun run dev` flow.
    if (this.#config.devUiProxy) {
      this.#setupDevUiProxy(this.#config.devUiProxy);
      return;
    }

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

  /**
   * Forward every non-`/api/*` request to {@link target}. Used in dev so the
   * hub serves the live Vite UI without a build step. Hop-by-hop headers
   * (`host`, `connection`) are stripped on outbound; the response body is
   * streamed back as-is, so HMR updates and source maps work unchanged.
   */
  #setupDevUiProxy(target: string): void {
    const app = this.#app;
    if (!app) {
      return;
    }

    app.all('*', async (c, next) => {
      if (c.req.path.startsWith('/api/')) {
        return next();
      }
      const upstreamUrl = `${target}${c.req.path}${c.req.url.includes('?') ? c.req.url.slice(c.req.url.indexOf('?')) : ''}`;
      const outHeaders = new Headers(c.req.raw.headers);
      outHeaders.delete('host');
      outHeaders.delete('connection');
      try {
        const upstream = await fetch(upstreamUrl, {
          method: c.req.method,
          headers: outHeaders,
          body:
            c.req.method === 'GET' || c.req.method === 'HEAD'
              ? undefined
              : await c.req.raw.arrayBuffer(),
          redirect: 'manual',
        });
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers,
        });
      } catch (err) {
        this.#logs.warn('Dev UI proxy failed', {
          target,
          path: c.req.path,
          error: err instanceof Error ? err.message : String(err),
        });
        return c.text(
          `Dev UI proxy could not reach ${target}. Is your UI dev server running?\n\n${err instanceof Error ? err.message : String(err)}`,
          502
        );
      }
    });

    this.#logs.info('Dev UI proxy enabled', { target });
  }
}
