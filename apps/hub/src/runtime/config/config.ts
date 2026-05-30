import { inject, singleton } from '@brika/di';
import { brikaContext } from '../context/brika-context';
import { ConfigLoader } from './config-loader';

/** Canonical host. One Worker serves both /v1/* (API) and /<name>/... (UI). */
const CANONICAL_HOST = 'hub.brika.dev';

/**
 * Default coordinator URL. The Cloudflare Worker serves both the signaling
 * API and the static UI shell on the same host, so this is also what users
 * open in their browser.
 * Operators can override via the Settings UI or `BRIKA_COORDINATOR_URL`.
 */
const DEFAULT_COORDINATOR_ORIGIN = `https://${CANONICAL_HOST}`;

/**
 * Derive the WebSocket signaling URL from the coordinator HTTP origin.
 * `https://hub.brika.dev` → `wss://hub.brika.dev/v1/hub`.
 */
export function deriveSignalingUrl(coordinatorOrigin: string): string {
  const url = new URL('/v1/hub', coordinatorOrigin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/**
 * Public-facing URL a user opens in a browser to reach this hub remotely.
 * Returns `https://hub.brika.dev/<name>` in production.
 *
 * `coordinatorOrigin` is honoured for development setups that point at a
 * non-production coordinator; in that case the URL falls back to a query
 * parameter so a single coordinator host can serve any hub name.
 */
export function derivePublicOrigin(name: string, coordinatorOrigin: string): string {
  if (!name) {
    return '';
  }
  try {
    const cord = new URL(coordinatorOrigin);
    // Production: hub.brika.dev/<name> — pretty, short, no wildcard DNS.
    if (cord.hostname === CANONICAL_HOST) {
      return `https://${CANONICAL_HOST}/${name}`;
    }
    // Dev / self-hosted coordinator: path-based on whatever host the
    // operator pointed the hub at. The local worker resolves it identically.
    const url = new URL(`/${name}`, coordinatorOrigin);
    return url.toString();
  } catch {
    return `https://${CANONICAL_HOST}/${name}`;
  }
}

/**
 * Remote-access config — one env var, everything else derived or persisted.
 *
 * `BRIKA_COORDINATOR_URL` (optional, default `https://api.brika.dev`) is the
 * only required setting. The hub name and bearer token are claimed via the
 * settings UI and stored in the OS keychain — there's no parallel env-var
 * path. To bootstrap a hub for tests/CI, call the coordinator's claim API
 * directly and let SecretStore persist the result.
 */
function stripTrailingSlashes(input: string): string {
  let end = input.length;
  while (end > 0 && input.codePointAt(end - 1) === 47) {
    end--;
  }
  return end === input.length ? input : input.slice(0, end);
}

export interface RemoteAccessConfig {
  /** Coordinator HTTP origin (e.g. `https://api.brika.dev`). */
  readonly coordinatorOrigin: string;
  /** Signaling WebSocket URL — derived from {@link coordinatorOrigin}. */
  readonly signalingUrl: string;
}

/**
 * Cap on the size of a single HTTP request body the hub will accept.
 * Bun's default (128 MB) is fine for JSON APIs but tight for plugin
 * file uploads — bump it to 1 GiB so the example file-browser plugin
 * (and real-world media plugins) don't 413 on routine uploads.
 *
 * Override with the `BRIKA_MAX_REQUEST_BODY_BYTES` env var. Setting it
 * to `0` disables the cap (not recommended on multi-tenant hosts).
 */
const DEFAULT_MAX_REQUEST_BODY_BYTES = 1024 * 1024 * 1024; // 1 GiB

@singleton()
export class HubConfig {
  readonly host: string;
  readonly port: number;
  readonly homeDir: string;
  /** Directory for static UI files (empty = disabled) */
  readonly staticDir: string;
  /**
   * Dev-only: if set, every non-`/api/*` request is forwarded to this origin
   * instead of being served from {@link staticDir}. Typically points at the
   * Vite dev server (`http://localhost:5173`) so the hub serves the latest
   * UI without a rebuild cycle. Wins over {@link staticDir} when both are
   * set. Never honoured in production — environment variable only.
   */
  readonly devUiProxy: string;
  /** Max request body the HTTP server accepts before returning 413. */
  readonly maxRequestBodyBytes: number;
  /** Remote-access (P2P) configuration. */
  readonly remoteAccess: RemoteAccessConfig;

  constructor() {
    // Try to get values from ConfigLoader if already loaded, else use env/defaults
    try {
      const loader = inject(ConfigLoader);
      const config = loader.get();
      this.host = process.env.BRIKA_HOST ?? config.hub.host;
      this.port = Number(process.env.BRIKA_PORT ?? config.hub.port);
      // Use .brika directory from config loader
      this.homeDir = process.env.BRIKA_HOME ?? loader.getBrikaDir();
    } catch {
      // Config not loaded yet, use env/defaults
      this.host = process.env.BRIKA_HOST ?? '127.0.0.1';
      this.port = Number(process.env.BRIKA_PORT ?? '3001');
      this.homeDir = process.env.BRIKA_HOME ?? brikaContext.brikaDir;
    }
    // Static file serving directory (empty = disabled, used in production Docker)
    this.staticDir = process.env.BRIKA_STATIC_DIR ?? '';
    // Dev-only UI proxy. Set to Vite's dev server (typically
    // `http://localhost:5173`) and the hub will serve the live UI without
    // a build step. Stripped of trailing slash so URL concatenation is clean.
    this.devUiProxy = stripTrailingSlashes(process.env.BRIKA_DEV_UI_PROXY ?? '');
    this.maxRequestBodyBytes = parseRequestBodyLimit(
      process.env.BRIKA_MAX_REQUEST_BODY_BYTES,
      DEFAULT_MAX_REQUEST_BODY_BYTES
    );

    const coordinatorOrigin =
      process.env.BRIKA_COORDINATOR_URL?.trim() || DEFAULT_COORDINATOR_ORIGIN;
    this.remoteAccess = {
      coordinatorOrigin,
      signalingUrl: deriveSignalingUrl(coordinatorOrigin),
    };
  }
}

/**
 * Parse `BRIKA_MAX_REQUEST_BODY_BYTES`. Accepts a plain integer or
 * `0` (disable cap). Anything else falls back to the default so a
 * typo doesn't silently uncap the server.
 */
function parseRequestBodyLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed === 0 ? Number.MAX_SAFE_INTEGER : Math.floor(parsed);
}

@singleton()
export class PluginManagerConfig {
  // Default IPC call timeout. Tuned to be generous enough for plugin
  // routes that fan out to ctx.* grants (each grant.request has its own
  // 60s watchdog hub-side) without leaving zombie pending calls when a
  // plugin genuinely hangs. The previous 5s was shorter than the inner
  // grant call timeout — a route that did even one ctx.* would time out
  // here before the inner call could resolve.
  readonly callTimeoutMs = 30_000;
  readonly heartbeatEveryMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly killTimeoutMs = 3000;

  /**
   * Per-plugin RSS soft-limit (bytes). When a plugin's resident set size
   * stays above this for {@link rssBreachSamples} consecutive metric samples
   * the hub triggers a graceful restart via the RestartPolicy. `0` disables.
   */
  readonly rssSoftLimitBytes: number;
  /**
   * Consecutive over-limit RSS samples required before a graceful restart is
   * triggered. Requiring a sustained breach (not a single spike) avoids
   * flapping on transient allocation peaks.
   */
  readonly rssBreachSamples = 3;

  // Auto-restart configuration
  readonly autoRestartEnabled = true;
  readonly restartBaseDelayMs = 1000;
  readonly restartMaxDelayMs = 60000;
  readonly restartMaxCrashes = 5;
  readonly restartCrashWindowMs = 60000;
  readonly restartStabilityMs = 30000;

  constructor() {
    try {
      const loader = inject(ConfigLoader);
      const config = loader.get();
      this.heartbeatEveryMs = config.hub.plugins.heartbeatInterval;
      this.heartbeatTimeoutMs = config.hub.plugins.heartbeatTimeout;
      this.rssSoftLimitBytes = config.hub.plugins.rssSoftLimitBytes;
    } catch {
      // Defaults: ping every 10s, declare dead after 60s without a pong.
      // A 15s timeout was too tight — under any non-trivial IPC load
      // (e.g. a UI page fetching multiple thumbnails through plugin routes),
      // the ping response can queue behind the route responses and trip
      // the timeout, after which the hub kills + restarts the plugin and
      // any in-flight requests fail with "Killed".
      this.heartbeatEveryMs = 10_000;
      this.heartbeatTimeoutMs = 60_000;
      // 512 MiB — mirrors ConfigLoader's DEFAULT_RSS_SOFT_LIMIT_BYTES.
      this.rssSoftLimitBytes = 512 * 1024 * 1024;
    }
  }
}
