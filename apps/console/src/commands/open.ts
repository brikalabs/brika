/**
 * `brika open` — open the hub's UI in the default browser.
 *
 * Refuses to open when the hub isn't running so the user doesn't land
 * on a connection-refused page. Honours BRIKA_HOST / BRIKA_PORT.
 */

import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { hubUrl } from '../shared/cli/hub-client';
import { openBrowser } from '../shared/cli/open';
import { checkPid } from '../shared/cli/pid';

export default defineCommand({
  name: 'open',
  description: "Open the hub's UI in the default browser",
  examples: ['brika open'],
  async handler() {
    const status = await checkPid();
    if (status.state !== 'running') {
      throw new CliError("hub isn't running — start it first with `brika start`");
    }
    const url = hubUrl();
    openBrowser(url);
    process.stdout.write(`${pc.cyan('opening')} ${url}\n`);
  },
});
