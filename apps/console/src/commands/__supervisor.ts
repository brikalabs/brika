/**
 * Hidden internal command — `brika start` detaches a process running
 * this to act as the standalone-install supervisor. Users never invoke
 * it directly; the leading underscores keep it out of `brika help`.
 *
 * The loop and its rationale live in
 * [hub-supervisor-loop.ts](../shared/cli/hub-supervisor-loop.ts) —
 * this file is just the cli entry point.
 */

import { defineCommand } from '@brika/cli';
import { runHubSupervisorLoop } from '../shared/cli/hub-supervisor-loop';

export default defineCommand({
  name: '__supervisor',
  hidden: true,
  description: 'Internal: hub respawn loop for standalone installs',
  async handler() {
    const code = await runHubSupervisorLoop();
    process.exit(code);
  },
});
