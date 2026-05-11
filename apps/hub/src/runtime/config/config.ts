import { inject, singleton } from '@brika/di';
import { dataDir } from '@/cli/utils/runtime';
import { ConfigLoader } from './config-loader';

/**
 * Default coordinator URL. Points at the live Cloudflare Worker deploy until
 * a custom domain (e.g. api.brika.dev) is wired up. Operators can override
 * via the Settings UI (persisted in the OS keychain) or the
 * `BRIKA_COORDINATOR_URL` env var.
 */
const DEFAULT_COORDINATOR_ORIGIN = 'https://brika-signaling.maxscharwath.workers.dev';
/**
 * DNS namespace for claimed hub names. The product domain `brika.dev` already
 * hosts `clay.`, `doc.`, etc., so hub names live under a dedicated subdomain
 * to keep the public namespace clean.
 */
const PUBLIC_DOMAIN = 'hubs.brika.dev';

/**
 * Derive the WebSocket signaling URL from the coordinator HTTP origin.
 * `https://api.brika.dev` → `wss://api.brika.dev/v1/hub`.
 */
export function deriveSignalingUrl(coordinatorOrigin: string): string {
  const url = new URL('/v1/hub', coordinatorOrigin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** Public-facing URL for a hub registered as `<name>` (used as Host header). */
export function derivePublicOrigin(name: string): string {
  return name ? `https://${name}.${PUBLIC_DOMAIN}` : '';
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
      this.homeDir = process.env.BRIKA_HOME ?? dataDir;
    }
    // Static file serving directory (empty = disabled, used in production Docker)
    this.staticDir = process.env.BRIKA_STATIC_DIR ?? '';

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
