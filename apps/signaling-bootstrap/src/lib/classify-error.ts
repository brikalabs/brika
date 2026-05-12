export interface ErrorClassification {
  title: string;
  detail: string;
  /** Drives the action affordance shown in the error card. */
  kind: 'retry' | 'change-name' | 'help';
  /** Seconds before an auto-retry fires. Only meaningful for `kind === 'retry'`. */
  autoRetry?: number;
}

/**
 * Read a bootstrap error message and turn it into a human-friendly card.
 * The shape of the message comes from `peer.ts` / `asset-graph.ts` —
 * each branch matches the throw site exactly.
 */
export function classifyError(err: unknown, hubName: string): ErrorClassification {
  const message = err instanceof Error ? err.message : String(err);

  if (/Unknown hub|404/.test(message)) {
    return {
      title: `No hub named "${hubName}"`,
      detail:
        "That name isn't registered on this coordinator. Double-check the URL — names are case-insensitive but must match exactly.",
      kind: 'change-name',
    };
  }
  if (/missing a module entry|outdated hub/i.test(message)) {
    return {
      title: 'Your hub needs an update',
      detail: `"${hubName}" is running an older version of Brika that doesn't serve its UI through the bridge yet. Update the hub and reload this page.`,
      kind: 'help',
    };
  }
  if (/Hub returned HTML for|Vite running/i.test(message)) {
    return {
      title: "Your hub's dev UI proxy isn't serving",
      detail:
        '"' +
        hubName +
        '" is in dev mode but the upstream Vite server isn\'t reachable. Start the UI dev server (or unset BRIKA_DEV_UI_PROXY), then retry.',
      kind: 'retry',
      autoRetry: 30,
    };
  }
  if (/Signaling WS|open timed out|errored before open/.test(message)) {
    return {
      title: "Can't reach the signaling service",
      detail:
        "The Brika coordinator might be temporarily down. This usually clears up on its own — we'll retry automatically.",
      kind: 'retry',
      autoRetry: 30,
    };
  }
  if (/Data channel|WebRTC connection (failed|closed)/.test(message)) {
    return {
      title: 'Your hub looks offline',
      detail: `"${hubName}" isn't reachable right now. Make sure the device is powered on and connected to the internet, then try again.`,
      kind: 'retry',
      autoRetry: 30,
    };
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return {
      title: 'Network error',
      detail:
        "Couldn't reach the Brika coordinator at all. Check your internet connection and try again.",
      kind: 'retry',
      autoRetry: 15,
    };
  }
  return {
    title: `Couldn't reach "${hubName}"`,
    detail: message,
    kind: 'retry',
    autoRetry: 30,
  };
}
