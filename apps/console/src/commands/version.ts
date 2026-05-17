/**
 * `brika version` — show what's in this binary.
 *
 * Two render paths:
 *   - Default: Brix performs a quick celebrate animation while the
 *     metadata block lands beside her. The TUI passes
 *     `clearOnStart: false` so runTui doesn't blank the operator's
 *     scrollback up-front (Ink still owns the visible viewport for the
 *     duration of the play, but the prior scrollback survives).
 *   - `--plain` / `-p` (or non-TTY stdout): print a clean key/value
 *     block on stdout. Script-friendly, no animation, no clear.
 *
 * Build info (commit, branch, build time) is baked into the binary at
 * `bun build --compile` time via the buildInfo macro — what you see is
 * exactly what's running.
 */

import { defineCommand } from '@brika/cli';
import React from 'react';
import { VersionView } from '../features/version';
import { readBuildInfo } from '../features/version/buildInfo';
import { formatBuildTime } from '../features/version/formatBuildTime';
import { runCommandTui } from '../runCommandTui';
import { CLI_VERSION } from '../version';

function plainLines(): ReadonlyArray<string> {
  const b = readBuildInfo();
  const dateSuffix = b.commitDate ? ` (${b.commitDate})` : '';
  return [
    `Brika Console v${CLI_VERSION}`,
    ...(b.branch ? [`  branch    ${b.branch}`] : []),
    ...(b.commit ? [`  commit    ${b.commit}${dateSuffix}`] : []),
    ...(b.buildTime ? [`  built     ${formatBuildTime(b.buildTime)}`] : []),
    `  runtime   bun ${Bun.version}`,
    `  platform  ${process.platform} ${process.arch}`,
  ];
}

function writePlain(): void {
  process.stdout.write(`${plainLines().join('\n')}\n`);
}

export default defineCommand({
  name: 'version',
  aliases: ['-v', '--version'],
  description: "Show Brika's version, commit, and build info",
  options: {
    plain: {
      type: 'boolean',
      short: 'p',
      description: 'Skip the animation — print a plain key/value block instead',
    },
  },
  examples: ['brika version', 'brika -v', 'brika version --plain'],
  async handler({ values }) {
    if (values.plain) {
      writePlain();
      return;
    }
    await runCommandTui(React.createElement(VersionView), writePlain, { clearOnStart: false });
  },
});
