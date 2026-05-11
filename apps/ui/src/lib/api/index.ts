/**
 * Hub API transport.
 *
 * The transport is selected once at app boot. We detect "this UI is talking
 * to a remote hub" three ways, in order of preference:
 *
 *   1. `?hub=<name>` query parameter (preferred). Works on any hostname
 *      including the coordinator's own (`signaling.brika.dev/?hub=maxime`).
 *      No DNS gymnastics required.
 *
 *   2. `<name>.hubs.brika.dev` subdomain. Nicer URL, but needs a wildcard
 *      DNS record on the brika.dev zone.
 *
 *   3. `VITE_BRIKA_REMOTE_FORCE=1` env override (dev shortcut).
 *
 * If none of the above match, we use {@link FetchTransport} — the LAN/dev
 * default that just hits `window.fetch`.
 */

import { DataChannelTransport } from './data-channel-transport';
import { FetchTransport } from './fetch-transport';
import type { Transport } from './transport';

export { FetchTransport } from './fetch-transport';
export {
  DataChannelTransport,
  type DataChannelTransportState,
  TransportError,
} from './data-channel-transport';
export type { Transport } from './transport';

const SUBDOMAIN_SUFFIX = '.hubs.brika.dev';
const DEFAULT_COORDINATOR_ORIGIN = 'https://signaling.brika.dev';
const HUB_QUERY_PARAM = 'hub';

let cachedTransport: Transport | null = null;

interface RemoteHints {
  readonly hubName: string;
  readonly hubOrigin: string;
  readonly coordinatorOrigin: string;
}

function detectRemote(): RemoteHints | null {
  if (typeof globalThis.location === 'undefined') {
    return null;
  }
  const loc = globalThis.location;
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const coordinatorOrigin = env.VITE_BRIKA_COORDINATOR_ORIGIN || DEFAULT_COORDINATOR_ORIGIN;

  // 1. ?hub=<name> wins — it's explicit, works on any hostname, and is the
  //    canonical URL we publish from the hub settings page.
  const queryHub = new URL(loc.href).searchParams.get(HUB_QUERY_PARAM);
  if (queryHub && queryHub.length > 0) {
    return {
      hubName: queryHub,
      hubOrigin: `${loc.protocol}//${queryHub}${SUBDOMAIN_SUFFIX}`,
      coordinatorOrigin,
    };
  }

  // 2. <name>.hubs.brika.dev subdomain — the prettier URL when wildcard DNS
  //    is set up.
  const hostname = loc.hostname.toLowerCase();
  if (hostname.endsWith(SUBDOMAIN_SUFFIX)) {
    const hubName = hostname.slice(0, -SUBDOMAIN_SUFFIX.length);
    if (hubName) {
      return {
        hubName,
        hubOrigin: `${loc.protocol}//${loc.host}`,
        coordinatorOrigin,
      };
    }
  }

  // 3. Dev override.
  if (env.VITE_BRIKA_REMOTE_FORCE === '1') {
    const forcedName = env.VITE_BRIKA_REMOTE_NAME ?? 'devtest';
    return {
      hubName: forcedName,
      hubOrigin: `https://${forcedName}${SUBDOMAIN_SUFFIX}`,
      coordinatorOrigin,
    };
  }

  return null;
}

export function getTransport(): Transport {
  if (cachedTransport) {
    return cachedTransport;
  }
  const remote = detectRemote();
  cachedTransport = remote
    ? new DataChannelTransport({
        hubName: remote.hubName,
        hubOrigin: remote.hubOrigin,
        coordinatorOrigin: remote.coordinatorOrigin,
      })
    : new FetchTransport();
  return cachedTransport;
}

/**
 * Convenience wrapper — call this anywhere you would have called `fetch`.
 * Components don't need to know whether they're on LAN or remote.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return getTransport().fetch(input, init);
}
