/**
 * `brika version` — show what's in this binary.
 *
 * Three render paths:
 *   - Default: Brix performs a quick celebrate animation while the
 *     metadata block lands beside her. The TUI passes
 *     `clearOnStart: false` so runTui doesn't blank the operator's
 *     scrollback up-front (Ink still owns the visible viewport for the
 *     duration of the play, but the prior scrollback survives).
 *   - `--plain` / `-p` (or non-TTY stdout): print a clean key/value
 *     block on stdout. Script-friendly, no animation, no clear.
 *   - `--json`: emit one line of JSON. Used by the installer scripts to
 *     detect an existing installation before upgrading.
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

/**
 * Single-line payload emitted by `brika version --json`. Consumed by the
 * installer/uninstaller scripts to detect an existing install before
 * upgrading. Kept tight: `commit` is the 7-char short SHA; callers that
 * want the full SHA can invoke the build-info accessor directly.
 *
 * Exported so the contract is unit-testable without spawning the CLI.
 */
export function getVersionJsonPayload(): {
  version: string;
  commit: string | null;
  commitDate: string | null;
  branch: string | null;
  buildTime: string | null;
  bun: string;
  platform: string;
  arch: string;
} {
  const b = readBuildInfo();
  return {
    version: CLI_VERSION,
    commit: b.commit,
    commitDate: b.commitDate,
    branch: b.branch,
    buildTime: b.buildTime,
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
  };
}

function writeJson(): void {
  process.stdout.write(`${JSON.stringify(getVersionJsonPayload())}\n`);
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
    json: {
      type: 'boolean',
      description: 'Emit a single JSON line (script-friendly, used by installer)',
    },
  },
  examples: ['brika version', 'brika -v', 'brika version --plain', 'brika version --json'],
  async handler({ values }) {
    if (values.json) {
      writeJson();
      return;
    }
    if (values.plain) {
      writePlain();
      return;
    }
    await runCommandTui(React.createElement(VersionView), writePlain, { clearOnStart: false });
  },
});
