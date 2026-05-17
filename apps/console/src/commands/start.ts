/**
 * `brika start` — bring the hub up.
 *
 * Two modes:
 *   - default (detached): forks a background `brika hub` child, waits
 *     ~1.5 s for it to claim the PID file, prints the supervisor pid,
 *     and exits. Same path as the TUI's `Ctrl+S` action.
 *   - `--attach` / `-a`: runs the hub inline in this process. Identical
 *     semantics to `brika hub` — useful when you want logs in your
 *     terminal and Ctrl+C to stop without dropping into the TUI.
 *
 * `--port` / `--host` work in both modes. In detached mode we set the
 * env vars on the parent *before* spawning so the child inherits them;
 * we also apply them before the `checkPid` health probe so the probe
 * targets the requested port (otherwise an unrelated hub on the default
 * port could short-circuit us into a misleading "already running").
 */

import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { spawnHubDetached } from '../shared/cli/hub-spawn-detached';
import { runForegroundHub } from '../shared/cli/hub-supervisor';

export default defineCommand({
  name: 'start',
  description: 'Start the Brika hub (detached by default, --attach to run foreground)',
  details: 'Detached mode mirrors the TUI Ctrl+S action; --attach is the same as `brika hub`.',
  options: {
    attach: {
      type: 'boolean',
      short: 'a',
      description: 'Run the hub in the foreground (block the terminal, Ctrl+C to stop)',
    },
    port: {
      type: 'string',
      short: 'p',
      description: 'Listen port (default: 3001)',
    },
    host: {
      type: 'string',
      description: 'Listen address (default: 127.0.0.1)',
    },
  },
  examples: [
    'brika start',
    'brika start --attach',
    'brika start -p 8080',
    'brika start -a -p 8080 --host 0.0.0.0',
  ],
  async handler({ values }) {
    // Apply overrides to the parent env BEFORE any spawn or health
    // probe. The detached child inherits the env; the foreground path
    // reads it from the hub's own config layer.
    if (values.port) {
      process.env.BRIKA_PORT = String(values.port);
    }
    if (values.host) {
      process.env.BRIKA_HOST = String(values.host);
    }

    if (values.attach) {
      await runForegroundHub({ port: values.port, host: values.host });
      return;
    }
    try {
      const pid = await spawnHubDetached();
      const label = pid === null ? pc.green('hub is up') : `${pc.green('hub is up')} (pid ${pid})`;
      process.stdout.write(`${label}\n`);
    } catch (e) {
      throw new CliError(`couldn't start hub: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
});
