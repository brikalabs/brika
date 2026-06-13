/**
 * Brika CLI command registration.
 *
 * The `brika` binary is TUI-first — the dashboard is the canonical
 * surface for plugin management, users, logs, etc. — but a small set
 * of script-friendly subcommands ride alongside so headless callers
 * (CI, shell scripts, hotkeys) can drive the hub without entering the
 * TUI:
 *
 *   brika                  full TUI
 *   brika start            detached background hub (TUI Ctrl+S equivalent)
 *   brika stop             SIGTERM the running hub
 *   brika status           one-line state + pid + url
 *   brika doctor           mode, data dir, and the hub this CLI targets
 *   brika open             open the UI in the default browser
 *   brika hub              foreground hub boot (TUI spawn target, CI/Docker)
 *   brika build            generate the plugin manifest from source (--check for CI)
 *   brika check            manifest checks + server/browser import-boundary scan
 *   brika version          short non-TUI version line
 *   brika update           check for a new release and apply it
 *   brika completions      shell tab-completion install
 *   brika uninstall        remove brika (--purge also wipes data + secrets)
 *   brika help             auto-generated help
 */

import { type Command, createCli, generateHelp } from '@brika/cli';
// The author verbs (build/check/verify) live in @brika/sdk so a plugin needs
// only @brika/sdk to run them; the full hub CLI re-registers the same modules.
import { build, check, verify } from '@brika/sdk/cli';
import pc from 'picocolors';
import supervisor from './commands/__supervisor';
import brix from './commands/brix';
import completions from './commands/completions';
import create from './commands/create';
import dashboard from './commands/dashboard';
import dev from './commands/dev';
import doctor from './commands/doctor';
import hub from './commands/hub';
import install from './commands/install';
import open from './commands/open';
import start from './commands/start';
import status from './commands/status';
import stop from './commands/stop';
import uninstall from './commands/uninstall';
import update from './commands/update';
import version from './commands/version';

/** Pool of hint lines hung off `brika help` — the framework strips hidden
 *  commands from the listing, but a faint footer keeps them discoverable
 *  without polluting the actual command grid. One is picked per render. */
const HIDDEN_HINTS: ReadonlyArray<string> = [
  '✨ tip — there’s more inside. try `brika brix`',
  '🥚 a tiny something is hiding behind `brika brix`',
  '🎮 if you’re bored, `brika brix` exists',
];

const HINT_FALLBACK = '🎮 try `brika brix`';

function pickHint(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const idx = (buf[0] ?? 0) % HIDDEN_HINTS.length;
  return HIDDEN_HINTS[idx] ?? HINT_FALLBACK;
}

/** Default formatter + a dim hint footer when listing the full command
 *  set. Per-command help (`brika hub --help`) is left untouched. */
function helpFormatter(commands: Command[], specific?: Command, prefix?: string): string {
  const base = generateHelp(commands, specific, prefix);
  if (specific) {
    return base;
  }
  return `${base}\n\n${pc.dim(pickHint())}`;
}

export const cli = createCli({ name: 'brika', defaultCommand: 'dashboard', helpFormatter })
  .addCommand(dashboard)
  .addCommand(start)
  .addCommand(stop)
  .addCommand(status)
  .addCommand(doctor)
  .addCommand(open)
  .addCommand(hub)
  .addCommand(create)
  .addCommand(build)
  .addCommand(check)
  .addCommand(verify)
  .addCommand(dev)
  .addCommand(install)
  .addCommand(version)
  .addCommand(update)
  .addCommand(completions)
  .addCommand(uninstall)
  // Hidden internal command — `brika start` re-invokes it to act as
  // the standalone-install supervisor (respawns the hub on exit-code
  // 42). Hidden from help.
  .addCommand(supervisor)
  // Hidden easter eggs — registered last so the explicit `brika help` /
  // `brika --help` lists keep the same shape as before. Resolvable by
  // direct name only (`brika brix`), absent from the global listing
  // grid but surfaced via the hint footer above.
  .addCommand(brix)
  .addHelp();
