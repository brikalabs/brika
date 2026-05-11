import { inject, singleton } from '@brika/di';
import { dataDir } from '@/cli/utils/runtime';
import { ConfigLoader } from './config-loader';

/**
 * Default coordinator URL. The Cloudflare Worker also serves the static UI
 * shell, so this same hostname is what users open in their browser.
 * Operators can override via the Settings UI or `BRIKA_COORDINATOR_URL`.
 */
const DEFAULT_COORDINATOR_ORIGIN = 'https://signaling.brika.dev';

/**
 * Derive the WebSocket signaling URL from the coordinator HTTP origin.
 * `https://signaling.brika.dev` → `wss://signaling.brika.dev/v1/hub`.
 */
export function deriveSignalingUrl(coordinatorOrigin: string): string {
  const url = new URL('/v1/hub', coordinatorOrigin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/**
 * Public-facing URL a user opens in a browser to reach this hub remotely.
 *
 * The Worker serves the same static UI shell from any path — the FE reads
 * `?hub=<name>` to know which hub to peer with via WebRTC. This avoids the
 * wildcard-DNS dance that a `<name>.hubs.brika.dev` scheme would need.
 */
export function derivePublicOrigin(name: string, coordinatorOrigin: string): string {
  if (!name) {
    return '';
  }
  const url = new URL('/', coordinatorOrigin);
  url.searchParams.set('hub', name);
  return url.toString();
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
