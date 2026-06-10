/**
 * `brika install <target>` for the lean SDK bin. Drives an ALREADY-running hub
 * over loopback: a local path is linked as a `file:` dependency, an npm name
 * (`name` or `name@version`) is resolved from the registry. This lean CLI cannot
 * START a hub (that needs the full Brika app); when none is reachable it prints
 * how to get one and exits non-zero. The full app's install additionally starts
 * the hub, and both share the `/api/registry/install` protocol.
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { CliError, defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { hubOrigin, installViaRegistry, pingHub } from '../hub';

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

/** With no <target>, install the cwd when it looks like a plugin directory. */
async function defaultTarget(): Promise<string | undefined> {
  return (await Bun.file(join(process.cwd(), 'package.json')).exists()) ? '.' : undefined;
}

/** Explain that a hub is needed and exit, shared by `install` and `dev`. */
export function noHubReachable(verb: string): never {
  const label = pc.yellow(`brika ${verb}`);
  process.stderr.write(
    `${label} needs a running Brika hub, and this CLI cannot start one.\n` +
      `  ${pc.dim('Start one with the full Brika app (`brika start`), or set BRIKA_HOST / BRIKA_PORT to reach an existing hub.')}\n`
  );
  process.exit(1);
}

export default defineCommand({
  name: 'install',
  description: 'Install a plugin into a running hub (local path or npm package)',
  details:
    'Drives an already-running hub over loopback: a local path is linked as a file: dependency, ' +
    'otherwise <target> is resolved from npm. With no target, installs the plugin in the ' +
    'current directory. This lean CLI cannot start a hub; use the full ' +
    'Brika app (`brika start`) for that, or point BRIKA_HOST / BRIKA_PORT at an existing one.',
  options: {},
  examples: [
    'brika install',
    'brika install ./my-plugin',
    'brika install @acme/brika-plugin-foo',
    'brika install brika-plugin-foo@1.2.0',
  ],
  async handler({ positionals }) {
    // No target: install the plugin in the current directory (mirrors `brika dev`).
    const target = positionals[0] ?? (await defaultTarget());
    if (!target) {
      throw new CliError(
        'usage: brika install [path-or-package] (no package.json in the current directory)'
      );
    }
    if (!(await pingHub())) {
      noHubReachable('install');
    }
    // Show which hub we are driving: with several hubs (a mortar dev hub, an
    // installed one) this is how you confirm the target before it acts.
    const hubLine = pc.dim(`→ ${hubOrigin()}`);
    process.stdout.write(`  ${hubLine}\n`);
    const { pkg, version } = await resolveTarget(target);
    await installViaRegistry(pkg, version);
    process.stdout.write(
      `\n  ${pc.green('✓')} ${pc.cyan(pkg)} installed, open ${pc.underline(hubOrigin())}\n\n`
    );
  },
});
