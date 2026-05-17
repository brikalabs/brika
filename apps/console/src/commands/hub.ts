/**
 * `brika hub` — headless hub boot (foreground).
 *
 * The single low-level entry for running the hub server in this
 * process. Used by:
 *
 *   1. The brika TUI (`brika`) — spawns it as a detached child when the
 *      user hits `Ctrl+S` (see `hub-spawn-detached`).
 *   2. Compose / Docker / systemd / CI entrypoints that want the hub
 *      without an attached terminal.
 *   3. `brika start --attach`, the friendlier-named alias.
 *
 * Bootstrap runs *inline* — the unified binary embeds the whole hub
 * runtime, there's no separate executable to fork. PID + cli-token
 * lifecycle and signal/shutdown live in `runForegroundHub`.
 */

import { defineCommand } from '@brika/cli';
import { runForegroundHub } from '../shared/cli/hub-supervisor';

export default defineCommand({
  name: 'hub',
  description: 'Boot the Brika hub (headless, no TUI)',
  details: 'Used by the TUI to spawn the server, and by CI/Docker entrypoints.',
  options: {
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
  examples: ['brika hub', 'brika hub -p 8080', 'brika hub --host 0.0.0.0'],
  async handler({ values }) {
    await runForegroundHub({ port: values.port, host: values.host });
  },
});
