/**
 * Typed bootstrap errors. Throw sites use these classes so the error card
 * can dispatch on `instanceof` instead of scraping `message` strings —
 * which decoupled rewording (or i18n) from classification.
 */

/** Marker base — every bootstrap-throw should extend this. */
export abstract class BootstrapError extends Error {
  override readonly name: string = 'BootstrapError';
}

/** Coordinator returned 404 (or equivalent) for the hub name. */
export class HubNotFoundError extends BootstrapError {
  override readonly name = 'HubNotFoundError';
  constructor(readonly hubName: string) {
    super(`No hub registered for "${hubName}"`);
  }
}

/** Coordinator reachable but rejected the ticket request for another reason. */
export class TicketError extends BootstrapError {
  override readonly name = 'TicketError';
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`/v1/tickets failed: ${status} ${body}`);
  }
}

/** Couldn't reach the coordinator at all (DNS/network/CORS). */
export class CoordinatorUnreachableError extends BootstrapError {
  override readonly name = 'CoordinatorUnreachableError';
  override readonly cause: unknown;
  constructor(cause: unknown) {
    super('Failed to reach coordinator');
    this.cause = cause;
  }
}

/** WebRTC handshake / data channel / signaling broke after we connected. */
export class HubUnreachableError extends BootstrapError {
  override readonly name = 'HubUnreachableError';
  constructor(
    readonly reason:
      | 'ws-open-timeout'
      | 'ws-errored'
      | 'ws-closed'
      | 'data-channel-timeout'
      | 'webrtc-failed'
      | 'webrtc-closed'
      | 'signaling-error',
    detail?: string
  ) {
    super(detail ?? `Hub unreachable (${reason})`);
  }
}

/** Watchdog tripped — the whole open() didn't reach `done` in time. */
export class BootstrapTimeoutError extends BootstrapError {
  override readonly name = 'BootstrapTimeoutError';
  constructor() {
    super('Bootstrap timed out');
  }
}

/** Hub `/index.html` is missing a module entry — running an old version. */
export class HubOutdatedError extends BootstrapError {
  override readonly name = 'HubOutdatedError';
  constructor() {
    super('Hub UI is missing a module entry — outdated hub');
  }
}

/** Browser/runtime support for service workers is missing or blocked. */
export class ServiceWorkerUnavailableError extends BootstrapError {
  override readonly name = 'ServiceWorkerUnavailableError';
  constructor() {
    super('Service worker required — browser does not support SW or it was blocked');
  }
}

/** Hub returned HTML for a `.js`/`.tsx` URL — Vite dev proxy isn't serving. */
export class HubDevProxyError extends BootstrapError {
  override readonly name = 'HubDevProxyError';
  constructor(readonly url: string) {
    super(`Hub returned HTML for ${url} — is the dev UI proxy reachable (Vite running)?`);
  }
}

/** Generic upstream error from the hub during asset BFS (non-404). */
export class HubUpstreamError extends BootstrapError {
  override readonly name = 'HubUpstreamError';
  constructor(
    readonly url: string,
    readonly status: number
  ) {
    super(`Hub ${url} → ${status}`);
  }
}
