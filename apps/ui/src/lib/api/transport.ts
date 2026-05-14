/**
 * Pluggable transport for hub API requests.
 *
 * Two implementations:
 *
 * - {@link FetchTransport} — plain `window.fetch`. Used when the UI is loaded
 *   from the hub itself (LAN access) or from Vite dev (which proxies to the hub).
 *
 * - {@link DataChannelTransport} — drives a WebRTC data channel to the hub via
 *   the signaling coordinator. Used when the UI shell is served from a
 *   `*.brika.dev` subdomain. Application traffic never touches our infra.
 *
 * The transport selection is decided once at boot. Components fetch through
 * the transport via {@link getTransport} (or the helper in `lib/query.ts`).
 */

export interface Transport {
  /**
   * Drop-in replacement for `window.fetch`, except that:
   *   - `credentials: 'include'` is implied
   *   - relative URLs resolve against the hub's canonical origin
   */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

  /** Tear down any connections held by this transport. */
  close(): void;

  /** Surface a description of the transport for telemetry / debugging. */
  readonly kind: 'fetch' | 'data-channel';
}
