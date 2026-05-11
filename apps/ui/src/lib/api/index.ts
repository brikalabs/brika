/**
 * Hub API transport.
 *
 * The transport is selected once at app boot:
 *
 *   - If `window.location.hostname` ends with `.hubs.brika.dev`, the UI was
 *     loaded from the remote shell — use {@link DataChannelTransport} and
 *     tunnel via WebRTC to the hub at `<subdomain>.hubs.brika.dev`.
 *
 *   - Otherwise (LAN access, Vite dev), use {@link FetchTransport} which is
 *     just `window.fetch`.
 *
 * The selection respects two env overrides — useful for local testing:
 *
 *   VITE_BRIKA_REMOTE_FORCE=1
 *       Force `DataChannelTransport` regardless of hostname.
 *   VITE_BRIKA_COORDINATOR_ORIGIN=https://api.brika.dev
 *       Override the coordinator URL.
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

const REMOTE_SUFFIX = '.hubs.brika.dev';
const DEFAULT_COORDINATOR_ORIGIN = 'https://api.brika.dev';

let cachedTransport: Transport | null = null;

interface RemoteHints {
  readonly hubName: string;
  readonly hubOrigin: string;
  readonly coordinatorOrigin: string;
}

function detectRemote(): RemoteHints | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const hostname = window.location.hostname.toLowerCase();
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const forced = env.VITE_BRIKA_REMOTE_FORCE === '1';
  const coordinatorOrigin = env.VITE_BRIKA_COORDINATOR_ORIGIN || DEFAULT_COORDINATOR_ORIGIN;

  if (forced) {
    const forcedName = env.VITE_BRIKA_REMOTE_NAME ?? 'devtest';
    return {
      hubName: forcedName,
      hubOrigin: `https://${forcedName}${REMOTE_SUFFIX}`,
      coordinatorOrigin,
    };
  }

  if (!hostname.endsWith(REMOTE_SUFFIX)) {
    return null;
  }
  const hubName = hostname.slice(0, -REMOTE_SUFFIX.length);
  if (!hubName) {
    return null;
  }
  return {
    hubName,
    hubOrigin: `${window.location.protocol}//${window.location.host}`,
    coordinatorOrigin,
  };
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
