/**
 * `brika publish`: build, verify, and publish a plugin to npm.
 *
 * Chains the pieces a plugin author would otherwise run by hand:
 *   1. `brika build`:  regenerate the manifest (blocks/bricks/sparks) from source,
 *      so a stale capability list can never ship.
 *   2. `brika verify`: validate the manifest (schema, engines.brika, $schema,
 *      keywords, file coverage); a hard gate.
 *   3. `npm publish`:  publish the source package (plugins ship `src/`; the hub
 *      compiles them on install), idempotently.
 *
 * Safety + DX: skips a version already on npm (versions are immutable); confirms
 * before the irreversible publish when interactive (skipped under --yes / CI /
 * no TTY); `--dry-run` rehearses; `--ignore-scripts` so no lifecycle script runs;
 * and `--provenance` is attached automatically under GitHub Actions (where the
 * OIDC id-token exists), giving authors signed provenance for free.
 */

import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { z } from 'zod';
import { runBuild } from './build';
import { runVerify } from './verify';

/**
 * A human is driving when there is a TTY on both ends and we are not in CI.
 * Checked with env + tty only, so this command pulls in no prompt library (the
 * lean @brika/sdk bin must stay free of @clack and its transitive deps).
 */
function isInteractive(): boolean {
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    return false;
  }
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/** Minimal y/N prompt over the built-in readline (no dependency). */
async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${message} ${pc.dim('(y/N)')} `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

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

const manifestSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    private: z.boolean().optional(),
  })
  .loose();

interface PluginManifest {
  name: string;
  version: string;
  isPrivate: boolean;
}

async function readManifest(dir: string): Promise<PluginManifest | null> {
  try {
    const parsed = manifestSchema.safeParse(await Bun.file(resolve(dir, 'package.json')).json());
    if (!parsed.success) {
      return null;
    }
    return {
      name: parsed.data.name,
      version: parsed.data.version,
      isPrivate: parsed.data.private === true,
    };
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

interface PublishStepOptions {
  dryRun: boolean;
  tag?: string;
  yes: boolean;
  noProvenance: boolean;
}

/**
 * The npm-publish step (after build + verify): resolve the dist-tag, skip a
 * version already live, confirm when interactive, and spawn `npm publish`.
 * Returns false only on a real publish failure (a skip or a declined prompt is
 * not a failure).
 */
async function publishToNpm(
  dir: string,
  manifest: PluginManifest,
  opts: PublishStepOptions
): Promise<boolean> {
  const { name, version } = manifest;
  const tag = resolveTag(version, opts.tag);

  // Hoisted to a plain string so the colored interpolations below are not nested
  // template literals (Sonar S4624).
  const nameVersion = `${name}@${version}`;

  // Idempotent: a version already on npm is immutable, so skip rather than 409.
  if (!opts.dryRun && isPublished(name, version)) {
    process.stdout.write(`\n  ${pc.cyan(nameVersion)} is already on npm ${pc.dim('(skip)')}\n`);
    return true;
  }

  const provenance = process.env.GITHUB_ACTIONS === 'true' && !opts.noProvenance;
  const args = buildPublishArgs({ tag, dryRun: opts.dryRun, provenance });

  const tagNote = pc.dim(`tag:${tag}`);
  const dryNote = opts.dryRun ? pc.yellow('  (dry run)') : '';
  process.stdout.write(`\n  ${pc.bold('Publish')} ${pc.cyan(nameVersion)} to npm  ${tagNote}${dryNote}\n`);

  // Confirm before the irreversible publish, but only when a human is driving.
  if (!opts.dryRun && !opts.yes && isInteractive()) {
    if (!(await confirm(`Publish ${nameVersion} to npm?`))) {
      process.stdout.write('  Publish cancelled.\n');
      return true;
    }
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
    return false;
  }
  process.stdout.write(pc.green(`\n  Published ${nameVersion}${opts.dryRun ? ' (dry run)' : ''}\n`));
  return true;
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

    // 3. Read the (now-regenerated) manifest and refuse to publish a private package.
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

    // 4. Publish (@brika/cli re-keys hyphenated flags to camelCase).
    const ok = await publishToNpm(dir, manifest, {
      dryRun: values.dryRun === true,
      tag: typeof values.tag === 'string' ? values.tag : undefined,
      yes: values.yes === true,
      noProvenance: values.noProvenance === true,
    });
    if (!ok) {
      process.exitCode = 1;
    }
  },
});
