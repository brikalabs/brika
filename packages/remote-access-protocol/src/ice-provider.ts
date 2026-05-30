/**
 * `IceServerProvider` is the seam for sourcing ICE servers (STUN + TURN)
 * advertised to clients and hubs. Three implementations ship:
 *
 *   - `StaticIceServerProvider`     — env-supplied list, merged with STUN defaults
 *   - `NoneIceServerProvider`       — empty list (for hubs that bring their own)
 *   - `CloudflareIceServerProvider` — short-lived TURN creds from Cloudflare Realtime
 *
 * Every provider returns *at least* `DEFAULT_ICE_SERVERS` unless explicitly
 * `None` — callers never have to special-case an empty result.
 */

import { DEFAULT_ICE_SERVERS, type IceServer } from './signaling';
import { type CloudflareTurnConfig, fetchCloudflareIceServers } from './turn';

export interface IceServerProvider {
  iceServers(): Promise<ReadonlyArray<IceServer>>;
}

/** Static list merged with STUN defaults. Empty input → defaults only. */
export class StaticIceServerProvider implements IceServerProvider {
  readonly #servers: ReadonlyArray<IceServer>;

  constructor(servers: ReadonlyArray<IceServer> = []) {
    this.#servers = servers.length > 0 ? [...DEFAULT_ICE_SERVERS, ...servers] : DEFAULT_ICE_SERVERS;
  }

  iceServers(): Promise<ReadonlyArray<IceServer>> {
    return Promise.resolve(this.#servers);
  }
}

/** Explicit empty list — for deployments where each hub provides its own. */
export class NoneIceServerProvider implements IceServerProvider {
  iceServers(): Promise<ReadonlyArray<IceServer>> {
    return Promise.resolve([]);
  }
}

/**
 * Mints fresh Cloudflare Realtime TURN credentials on each call, merged with
 * STUN defaults. Soft-fails to defaults when the API errors or creds are unset.
 */
export class CloudflareIceServerProvider implements IceServerProvider {
  readonly #config: CloudflareTurnConfig;

  constructor(config: CloudflareTurnConfig) {
    this.#config = config;
  }

  async iceServers(): Promise<ReadonlyArray<IceServer>> {
    const turn = await fetchCloudflareIceServers(this.#config);
    return turn.length > 0 ? [...DEFAULT_ICE_SERVERS, ...turn] : DEFAULT_ICE_SERVERS;
  }
}
