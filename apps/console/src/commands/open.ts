/**
 * `brika open`: open the hub's UI in the default browser.
 *
 * If the hub isn't responding, `open` starts it (detached) first rather
 * than refusing, so it works from a cold start without a separate
 * `brika start`. `--no-start` keeps the old behaviour: error out instead
 * of spawning a hub. Honours BRIKA_HOST / BRIKA_PORT.
 *
 * Readiness is gated on a health response, not just the pid file: the
 * hub claims its pid file before the HTTP server binds, so opening on
 * "pid present" alone could land on a connection-refused page.
 */

import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { hubUrl } from '../shared/cli/hub-client';
import { spawnHubDetached } from '../shared/cli/hub-spawn-detached';
import { openBrowser } from '../shared/cli/open';
import { pingHub } from '../shared/cli/pid';

/** How long to wait for a freshly-spawned hub to answer /api/health. */
const READY_TIMEOUT_MS = 5000;
const READY_POLL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll /api/health until it answers or the timeout elapses. */
async function waitForHub(): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (true) {
    if (await pingHub()) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await sleep(READY_POLL_MS);
  }
}

export default defineCommand({
  name: 'open',
  description: "Open the hub's UI in the default browser",
  options: {
    'no-start': {
      type: 'boolean',
      description: "Don't start the hub if it isn't running; error out instead",
    },
  },
  examples: ['brika open', 'brika open --no-start'],
  async handler({ values }) {
    const url = hubUrl();
    if (!(await pingHub())) {
      if (values['no-start']) {
        throw new CliError("hub isn't running, start it first with `brika start`");
      }
      process.stdout.write(`${pc.dim("hub isn't running, starting it...")}\n`);
      try {
        const pid = await spawnHubDetached();
        const label =
          pid === null ? pc.green('hub is up') : `${pc.green('hub is up')} (pid ${pid})`;
        process.stdout.write(`${label}\n`);
      } catch (e) {
        throw new CliError(`couldn't start hub: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!(await waitForHub())) {
        throw new CliError(`hub started but isn't responding at ${url} yet, try again in a moment`);
      }
    }
    openBrowser(url);
    process.stdout.write(`${pc.cyan('opening')} ${url}\n`);
  },
});
