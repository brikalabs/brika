/**
 * Open the hub's web UI once it's actually serving.
 *
 * Readiness is gated on a health response, not just the pid file: the
 * hub claims its pid file before the HTTP server binds, so opening on
 * "pid present" alone could land on a connection-refused page. Shared by
 * `brika open` and `brika start --open`.
 */

import pc from 'picocolors';
import { hubUrl } from './hub-client';
import { openBrowser } from './open';
import { pingHub } from './pid';

/** How long to wait for the hub to answer /api/health before giving up. */
const READY_TIMEOUT_MS = 5000;
const READY_POLL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll /api/health until it answers or the timeout elapses. The timing
 * is parameterised (defaulting to the module constants) so tests can
 * exercise the retry/timeout path without waiting whole seconds.
 */
export async function waitForHub(
  timeoutMs: number = READY_TIMEOUT_MS,
  pollMs: number = READY_POLL_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (await pingHub()) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await sleep(pollMs);
  }
}

/** Open the hub UI in the default browser and print `opening <url>`. */
export function openHubUi(): void {
  const url = hubUrl();
  openBrowser(url);
  process.stdout.write(`${pc.cyan('opening')} ${url}\n`);
}

/**
 * Wait for the hub to respond, then open its UI. Returns `false` (and
 * opens nothing) if it never became ready within the timeout.
 */
export async function openHubUiWhenReady(): Promise<boolean> {
  if (!(await waitForHub())) {
    return false;
  }
  openHubUi();
  return true;
}
