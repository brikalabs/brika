/**
 * Brika CLI command registration.
 *
 * Surface is intentionally tiny — `brika` IS the TUI. Hub control,
 * plugin management, users, logs, etc. all happen inside it.
 *
 *   brika                  full TUI
 *   brika hub              headless hub boot (for TUI spawn + CI)
 *   brika version          short non-TUI version line (script-friendly)
 *   brika completions      shell tab-completion install
 *   brika help             auto-generated help
 */

import { createCli } from '@brika/cli';
import completions from './commands/completions';
import dashboard from './commands/dashboard';
import hub from './commands/hub';
import version from './commands/version';

export const cli = createCli({ name: 'brika', defaultCommand: 'dashboard' })
  .addCommand(dashboard)
  .addCommand(hub)
  .addCommand(version)
  .addCommand(completions)
  .addHelp();
