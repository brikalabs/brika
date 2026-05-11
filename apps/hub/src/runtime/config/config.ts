import { inject, singleton } from '@brika/di';
import { dataDir } from '@/cli/utils/runtime';
import { ConfigLoader } from './config-loader';

const DEFAULT_SIGNALING_URL = 'wss://api.brika.dev/v1';

function parseBool(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export interface RemoteAccessConfig {
  /** Whether remote-access P2P is enabled on this hub. */
  readonly enabled: boolean;
  /** Hub name registered on the coordinator (e.g. "maxime"). */
  readonly name: string;
  /** Signaling WebSocket URL (defaults to wss://api.brika.dev/v1). */
  readonly signalingUrl: string;
  /**
   * Canonical public origin used when the hub is reached remotely
   * (e.g. https://maxime.brika.dev). Empty string when remote access is disabled.
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

    const name = process.env.BRIKA_REMOTE_NAME?.trim() ?? '';
    const enabled = parseBool(process.env.BRIKA_REMOTE_ACCESS) && name.length > 0;
    const signalingUrl = process.env.BRIKA_SIGNALING_URL?.trim() || DEFAULT_SIGNALING_URL;
    const publicOrigin =
      process.env.BRIKA_PUBLIC_ORIGIN?.trim() ||
      (enabled ? `https://${name}.brika.dev` : '');
    this.remoteAccess = {
      enabled,
      name,
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
