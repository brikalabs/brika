/**
 * `brika install <target>`: install a plugin into the hub (no watch loop).
 *
 * <target> is either a local path (linked as a `file:` dependency) or an npm
 * package (`name` or `name@version`). For live development with a build pass and
 * hot-reload, use `brika dev` instead; this is the one-shot install for
 * sideloading, demos, and CI.
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { hubUrl } from '../shared/cli/hub-client';
import { ensureHub, installViaRegistry } from '../shared/cli/plugin-install';

/** Resolve <target> to a registry install request (local file: dep or npm pkg). */
export async function resolveTarget(target: string): Promise<{ pkg: string; version?: string }> {
  const looksLikePath = target.startsWith('.') || target.startsWith('~') || isAbsolute(target);
  const dir = resolve(target);
  if (looksLikePath || (await Bun.file(join(dir, 'package.json')).exists())) {
    let name: string | undefined;
    try {
      const pkg: { name?: string } = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
      name = pkg.name;
    } catch {
      throw new CliError(`no package.json in ${dir}`);
    }
    if (!name) {
      throw new CliError('package.json has no "name"');
    }
    return { pkg: name, version: `file:${dir}` };
  }
  // An npm package: "name" or "name@version" (keep the leading @ of a scope).
  const at = target.lastIndexOf('@');
  if (at > 0) {
    return { pkg: target.slice(0, at), version: target.slice(at + 1) };
  }
  return { pkg: target };
}

export default defineCommand({
  name: 'install',
  description: 'Install a plugin into the hub (local path or npm package)',
  details:
    'Installs <target> into the running hub via the registry: a local path is linked as a file: ' +
    'dependency, otherwise it is resolved from npm. Starts the hub if it is not running. For live ' +
    'development with build + hot-reload, use `brika dev`.',
  options: {},
  examples: [
    'brika install ./my-plugin',
    'brika install @acme/brika-plugin-foo',
    'brika install brika-plugin-foo@1.2.0',
  ],
  async handler({ positionals }) {
    const target = positionals[0];
    if (!target) {
      throw new CliError('usage: brika install <path-or-package>');
    }
    const { pkg, version } = await resolveTarget(target);
    await ensureHub();
    await installViaRegistry(pkg, version);
    process.stdout.write(
      `\n  ${pc.green('✓')} ${pc.cyan(pkg)} installed, open ${pc.underline(hubUrl())}\n\n`
    );
  },
});
