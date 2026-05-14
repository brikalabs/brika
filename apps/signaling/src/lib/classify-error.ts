import {
  BootstrapError,
  BootstrapTimeoutError,
  CoordinatorUnreachableError,
  HubDevProxyError,
  HubNotFoundError,
  HubOutdatedError,
  HubUnreachableError,
  HubUpstreamError,
  ServiceWorkerUnavailableError,
  TicketError,
} from './errors';

export interface ErrorClassification {
  title: string;
  detail: string;
  /** Drives the action affordance shown in the error card. */
  kind: 'retry' | 'change-name' | 'help';
  /** Seconds before an auto-retry fires. Only meaningful for `kind === 'retry'`. */
  autoRetry?: number;
}

/**
 * Map a thrown bootstrap error to the UI shape. Dispatches on concrete
 * error classes from {@link ./errors} — never reads `message` for routing,
 * so rewording (or i18n) of error strings can't accidentally change the
 * card the user sees.
 */
export function classifyError(err: unknown, hubName: string): ErrorClassification {
  if (err instanceof HubNotFoundError) {
    return {
      title: `No hub named "${hubName}"`,
      detail:
        "That name isn't registered on this coordinator. Double-check the URL — names are case-insensitive but must match exactly.",
      kind: 'change-name',
    };
  }

  if (err instanceof HubOutdatedError || err instanceof ServiceWorkerUnavailableError) {
    return {
      title:
        err instanceof HubOutdatedError ? 'Your hub needs an update' : 'Browser not supported',
      detail:
        err instanceof HubOutdatedError
          ? `"${hubName}" is running an older version of Brika that doesn't serve its UI through the bridge yet. Update the hub and reload this page.`
          : "This browser blocked the service worker the bootstrap needs. Try a regular (non-private) window, or a Chromium/Firefox/Safari build that supports service workers.",
      kind: 'help',
    };
  }

  if (err instanceof HubDevProxyError) {
    return {
      title: "Your hub's dev UI proxy isn't serving",
      detail: `"${hubName}" is in dev mode but the upstream Vite server isn't reachable. Start the UI dev server (or unset BRIKA_DEV_UI_PROXY), then retry.`,
      kind: 'retry',
      autoRetry: 30,
    };
  }

  if (err instanceof HubUnreachableError || err instanceof BootstrapTimeoutError) {
    return {
      title: 'Your hub looks offline',
      detail: `"${hubName}" isn't reachable right now. Make sure the device is powered on and connected to the internet, then try again.`,
      kind: 'retry',
      autoRetry: 30,
    };
  }

  if (err instanceof TicketError) {
    return {
      title: "Couldn't get a session ticket",
      detail: `The coordinator rejected the ticket request (HTTP ${err.status}). This usually clears up on its own — we'll retry automatically.`,
      kind: 'retry',
      autoRetry: 30,
    };
  }

  if (err instanceof CoordinatorUnreachableError) {
    return {
      title: 'Network error',
      detail:
        "Couldn't reach the Brika coordinator at all. Check your internet connection and try again.",
      kind: 'retry',
      autoRetry: 15,
    };
  }

  if (err instanceof HubUpstreamError) {
    return {
      title: `Couldn't load "${hubName}"`,
      detail: `The hub returned HTTP ${err.status} for ${err.url}.`,
      kind: 'retry',
      autoRetry: 30,
    };
  }

  // Unknown shape — surface the message as a fallback. Anything reaching
  // this branch is a bootstrap throw site we forgot to type; the generic
  // card lets users retry while we add the class.
  const detail = err instanceof BootstrapError || err instanceof Error ? err.message : String(err);
  return {
    title: `Couldn't reach "${hubName}"`,
    detail,
    kind: 'retry',
    autoRetry: 30,
  };
}
