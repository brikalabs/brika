/**
 * `brika dev` — one command from a plugin checkout to a running dashboard.
 *
 * Run from a plugin directory: it generates the manifest (`brika build`), makes
 * sure the hub is up (starting it detached if needed), then installs the plugin
 * as a local `file:` dependency so the hub loads it and hot-reloads on source
 * edits. Re-run after a manifest-affecting change (new block/brick/spark) to
 * regenerate and reinstall.
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineCommand } from '@brika/cli';
import { runBuild } from '@brika/sdk/cli';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { hubUrl } from '../shared/cli/hub-client';
import { ensureHub, installViaRegistry } from '../shared/cli/plugin-install';

/** Read the plugin's package name, or fail with guidance if this isn't a plugin dir. */
export async function readPluginName(dir: string): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(join(dir, 'package.json'), 'utf8');
  } catch {
    throw new CliError(`no package.json in ${dir} — run \`brika dev\` from a plugin directory`);
  }
  const pkg: { name?: string } = JSON.parse(raw);
  if (!pkg.name) {
    throw new CliError('package.json has no "name"');
  }
  return pkg.name;
}

export default defineCommand({
  name: 'dev',
  description: 'Build the current plugin, start the hub if needed, and install it for live dev',
  details:
    'Run from a plugin directory. Generates the manifest, ensures the hub is running, and ' +
    'installs the plugin as a local file: dependency so the hub loads it and hot-reloads on edits.',
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

    await ensureHub();
    await installViaRegistry(name, `file:${dir}`);

    process.stdout.write(
      `\n  ${pc.green('✓')} ${pc.cyan(name)} installed — open ${pc.underline(hubUrl())}\n  ${pc.dim('Edit source to hot-reload; re-run `brika dev` after a manifest change.')}\n\n`
    );
  },
});
