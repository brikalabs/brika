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
export interface RemoteAccessConfig {
  /** Coordinator HTTP origin (e.g. `https://api.brika.dev`). */
  readonly coordinatorOrigin: string;
  /** Signaling WebSocket URL — derived from {@link coordinatorOrigin}. */
  readonly signalingUrl: string;
}

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
    this.devUiProxy = (process.env.BRIKA_DEV_UI_PROXY ?? '').replace(/\/+$/, '');

    const coordinatorOrigin =
      process.env.BRIKA_COORDINATOR_URL?.trim() || DEFAULT_COORDINATOR_ORIGIN;
    this.remoteAccess = {
      coordinatorOrigin,
      signalingUrl: deriveSignalingUrl(coordinatorOrigin),
    };
  }
}

@singleton()
export class PluginManagerConfig {
  readonly callTimeoutMs = 5000;
  readonly heartbeatEveryMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly killTimeoutMs = 3000;

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
    } catch {
      this.heartbeatEveryMs = 5000;
      this.heartbeatTimeoutMs = 15000;
    }
  }
}
