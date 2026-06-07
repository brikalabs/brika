/**
 * `brika dev` for the lean SDK bin. Builds the plugin's manifest, then installs
 * it into an ALREADY-running hub as a `file:` dependency so the hub loads it and
 * hot-reloads on source edits. This lean CLI cannot START a hub (that needs the
 * full Brika app); when none is reachable it explains how to get one and exits
 * non-zero. The full app's dev additionally starts the hub.
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CliError, defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { hubOrigin, installViaRegistry, pingHub } from '../hub';
import { runBuild } from './build';
import { noHubReachable } from './install';

/** Read the plugin's package name, or fail with guidance if this isn't a plugin dir. */
async function readPluginName(dir: string): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(join(dir, 'package.json'), 'utf8');
  } catch {
    throw new CliError(`no package.json in ${dir}, run \`brika dev\` from a plugin directory`);
  }
  const pkg: { name?: string } = JSON.parse(raw);
  if (!pkg.name) {
    throw new CliError('package.json has no "name"');
  }
  return pkg.name;
}

export default defineCommand({
  name: 'dev',
  description: 'Build the current plugin and install it into a running hub for live dev',
  details:
    'Run from a plugin directory. Generates the manifest and installs the plugin as a local ' +
    'file: dependency so a running hub loads it and hot-reloads on edits. This lean CLI cannot ' +
    'start a hub; use the full Brika app (`brika start`) for that, or point BRIKA_HOST / ' +
    'BRIKA_PORT at an existing one.',
  options: {
    dir: { type: 'string', description: 'Plugin directory (default: current directory)' },
  },
  examples: ['brika dev', 'brika dev --dir plugins/timer'],
  async handler({ values }) {
    const dir = resolve(values.dir ?? process.cwd());
    const name = await readPluginName(dir);

    process.stdout.write(pc.bold(`\n  Developing ${pc.cyan(name)}\n\n`));

    if (!(await runBuild(dir, false))) {
      process.exitCode = 1;
      return;
    }
    if (!(await pingHub())) {
      noHubReachable('dev');
    }
    const target = pc.dim(`→ ${hubOrigin()}`);
    process.stdout.write(`  ${target}\n`);
    await installViaRegistry(name, `file:${dir}`);

    process.stdout.write(
      `\n  ${pc.green('✓')} ${pc.cyan(name)} installed, open ${pc.underline(hubOrigin())}\n  ${pc.dim('Edit source to hot-reload; re-run `brika dev` after a manifest change.')}\n\n`
    );
  },
});
