/**
 * `brika publish`: build, verify, and publish a plugin to npm.
 *
 * Chains the pieces a plugin author would otherwise run by hand:
 *   1. `brika build`  — regenerate the manifest (blocks/bricks/sparks) from source,
 *      so a stale capability list can never ship.
 *   2. `brika verify` — validate the manifest (schema, engines.brika, $schema,
 *      keywords, file coverage); a hard gate.
 *   3. `npm publish`  — publish the source package (plugins ship `src/`; the hub
 *      compiles them on install), idempotently.
 *
 * Safety + DX: skips a version already on npm (versions are immutable); confirms
 * before the irreversible publish when interactive (skipped under --yes / CI /
 * no TTY); `--dry-run` rehearses; `--ignore-scripts` so no lifecycle script runs;
 * and `--provenance` is attached automatically under GitHub Actions (where the
 * OIDC id-token exists), giving authors signed provenance for free.
 */

import { resolve } from 'node:path';
import { defineCommand } from '@brika/cli';
import { confirmOrAbort, isCI } from '@brika/cli/prompts';
import pc from 'picocolors';
import { runBuild } from './build';
import { runVerify } from './verify';

/** Default dist-tag: a prerelease (version contains `-`) routes to `next`, else `latest`. */
export function resolveTag(version: string, explicit?: string): string {
  if (explicit !== undefined && explicit !== '') {
    return explicit;
  }
  return version.includes('-') ? 'next' : 'latest';
}

/** Assemble the `npm publish` argument list. Pure, so it is unit-tested directly. */
export function buildPublishArgs(opts: {
  tag: string;
  dryRun: boolean;
  provenance: boolean;
}): string[] {
  // --ignore-scripts: publish already ran build + verify, so no lifecycle hook
  // needs to (re)run, and refusing them keeps a publish from ever executing
  // third-party script code.
  const args = ['npm', 'publish', '--access', 'public', '--tag', opts.tag, '--ignore-scripts'];
  if (opts.provenance) {
    args.push('--provenance');
  }
  if (opts.dryRun) {
    args.push('--dry-run');
  }
  return args;
}

interface PluginManifest {
  name: string;
  version: string;
  isPrivate: boolean;
}

async function readManifest(dir: string): Promise<PluginManifest | null> {
  try {
    const raw: unknown = await Bun.file(resolve(dir, 'package.json')).json();
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof (raw as { name?: unknown }).name !== 'string' ||
      typeof (raw as { version?: unknown }).version !== 'string'
    ) {
      return null;
    }
    const m = raw as { name: string; version: string; private?: boolean };
    return { name: m.name, version: m.version, isPrivate: m.private === true };
  } catch {
    return null;
  }
}

/** True if `name@version` already exists on the registry (npm versions are immutable). */
function isPublished(name: string, version: string): boolean {
  const proc = Bun.spawnSync(['npm', 'view', `${name}@${version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return proc.exitCode === 0 && proc.stdout.toString().trim() === version;
}

export default defineCommand({
  name: 'publish',
  description: 'Build, verify, and publish a plugin to npm',
  details:
    'Runs `brika build` then `brika verify`, then `npm publish`. Skips a version already ' +
    'on npm, confirms before publishing when interactive, and attaches provenance under ' +
    'GitHub Actions. Use --dry-run to rehearse.',
  options: {
    dir: { type: 'string', description: 'Plugin directory (default: current directory)' },
    tag: { type: 'string', description: 'npm dist-tag (default: latest, or next for prereleases)' },
    'dry-run': { type: 'boolean', description: 'Rehearse: build + verify + npm publish --dry-run' },
    yes: { type: 'boolean', short: 'y', description: 'Skip the confirmation prompt' },
    'skip-build': { type: 'boolean', description: 'Do not regenerate the manifest first' },
    'skip-verify': { type: 'boolean', description: 'Do not verify first (not recommended)' },
    'no-provenance': { type: 'boolean', description: 'Do not pass --provenance under CI' },
  },
  examples: ['brika publish', 'brika publish --dry-run', 'brika publish --tag next --yes'],
  async handler({ values }) {
    const dir = resolve(values.dir ?? process.cwd());
    // @brika/cli re-keys hyphenated flags to camelCase (`--dry-run` -> values.dryRun).
    const dryRun = values.dryRun === true;

    // 1. Build (regenerate the manifest from source).
    if (values.skipBuild !== true && !(await runBuild(dir, false))) {
      process.exitCode = 1;
      return;
    }

    // 2. Verify (hard gate).
    if (values.skipVerify !== true && !(await runVerify(dir))) {
      process.exitCode = 1;
      return;
    }

    // 3. Read the (now-regenerated) manifest.
    const manifest = await readManifest(dir);
    if (manifest === null) {
      process.stderr.write(
        `${pc.red('✗')} Could not read a valid ${resolve(dir, 'package.json')}\n`
      );
      process.exitCode = 1;
      return;
    }
    if (manifest.isPrivate) {
      process.stderr.write(
        `${pc.red('✗')} ${manifest.name} is marked private; refusing to publish.\n`
      );
      process.exitCode = 1;
      return;
    }

    const { name, version } = manifest;
    const tag = resolveTag(version, typeof values.tag === 'string' ? values.tag : undefined);

    // Idempotent: a version already on npm is immutable, so skip rather than 409.
    if (!dryRun && isPublished(name, version)) {
      process.stdout.write(
        `\n  ${pc.cyan(`${name}@${version}`)} is already on npm ${pc.dim('(skip)')}\n`
      );
      return;
    }

    const provenance = process.env.GITHUB_ACTIONS === 'true' && values.noProvenance !== true;
    const args = buildPublishArgs({ tag, dryRun, provenance });

    const label = pc.cyan(`${name}@${version}`);
    process.stdout.write(
      `\n  ${pc.bold('Publish')} ${label} to npm  ${pc.dim(`tag:${tag}`)}${dryRun ? pc.yellow('  (dry run)') : ''}\n`
    );

    // Confirm before the irreversible publish, but only when a human is driving
    // (interactive TTY, not CI; isCI from @clack is a function evaluated here).
    if (!dryRun && values.yes !== true && !isCI() && process.stdout.isTTY === true) {
      await confirmOrAbort({ message: `Publish ${name}@${version} to npm?` });
    }

    // stdin inherited so npm can prompt for an OTP when 2FA is enabled.
    const proc = Bun.spawn(args, {
      cwd: dir,
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'inherit',
    });
    const code = await proc.exited;
    if (code !== 0) {
      process.stderr.write(pc.red(`\n  publish failed (npm exited ${code})\n`));
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      pc.green(`\n  Published ${name}@${version}${dryRun ? ' (dry run)' : ''}\n`)
    );
  },
});
