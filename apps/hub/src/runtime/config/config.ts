import { inject, singleton } from '@brika/di';
import { dataDir } from '@/cli/utils/runtime';
import { ConfigLoader } from './config-loader';

const DEFAULT_COORDINATOR_ORIGIN = 'https://api.brika.dev';
const PUBLIC_DOMAIN = 'brika.dev';

function parseBool(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

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

export interface RemoteAccessConfig {
  /** Whether remote-access P2P is enabled on this hub (env flag). */
  readonly enabled: boolean;
  /**
   * Bootstrap name from `BRIKA_REMOTE_NAME` (dev override). The runtime
   * service may overlay a name persisted in the OS keychain.
   */
  readonly bootstrapName: string;
  /** Coordinator HTTP origin (e.g. `https://api.brika.dev`). */
  readonly coordinatorOrigin: string;
  /** Signaling WebSocket URL — derived from {@link coordinatorOrigin}. */
  readonly signalingUrl: string;
  /**
   * Canonical public origin used when the hub is reached remotely
   * (e.g. `https://maxime.brika.dev`). Computed from the bootstrap name when
   * present; the service may compute a different one once a persisted name
   * is loaded from secrets.
   */
  readonly publicOrigin: string;
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

    const bootstrapName = process.env.BRIKA_REMOTE_NAME?.trim() ?? '';
    const enabled = parseBool(process.env.BRIKA_REMOTE_ACCESS);
    const coordinatorOrigin =
      process.env.BRIKA_COORDINATOR_URL?.trim() || DEFAULT_COORDINATOR_ORIGIN;
    // Backwards-compat: older env var BRIKA_SIGNALING_URL still wins if set.
    const signalingUrl =
      process.env.BRIKA_SIGNALING_URL?.trim() || deriveSignalingUrl(coordinatorOrigin);
    const publicOrigin =
      process.env.BRIKA_PUBLIC_ORIGIN?.trim() || derivePublicOrigin(bootstrapName);
    this.remoteAccess = {
      enabled,
      bootstrapName,
      coordinatorOrigin,
      signalingUrl,
      publicOrigin,
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
