/**
 * `brika open` — open the hub's UI in the default browser.
 *
 * If the hub isn't running, `open` starts it (detached) first rather
 * than refusing, so it works from a cold start without a separate
 * `brika start`. `--no-start` keeps the old behaviour: error out instead
 * of spawning a hub. Honours BRIKA_HOST / BRIKA_PORT.
 */

import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { hubUrl } from '../shared/cli/hub-client';
import { spawnHubDetached } from '../shared/cli/hub-spawn-detached';
import { openBrowser } from '../shared/cli/open';
import { checkPid } from '../shared/cli/pid';

export default defineCommand({
  name: 'open',
  description: "Open the hub's UI in the default browser",
  options: {
    'no-start': {
      type: 'boolean',
      description: "Don't start the hub if it isn't running — error out instead",
    },
  },
  examples: ['brika open', 'brika open --no-start'],
  async handler({ values }) {
    const status = await checkPid();
    if (status.state !== 'running') {
      if (values['no-start']) {
        throw new CliError("hub isn't running — start it first with `brika start`");
      }
      process.stdout.write(`${pc.dim("hub isn't running — starting it…")}\n`);
      try {
        const pid = await spawnHubDetached();
        const label =
          pid === null ? pc.green('hub is up') : `${pc.green('hub is up')} (pid ${pid})`;
        process.stdout.write(`${label}\n`);
      } catch (e) {
        throw new CliError(`couldn't start hub: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const url = hubUrl();
    openBrowser(url);
    process.stdout.write(`${pc.cyan('opening')} ${url}\n`);
  },
});
