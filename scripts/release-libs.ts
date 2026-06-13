#!/usr/bin/env bun

/**
 * Publish the shipped public packages (the @brika/sdk runtime closure +
 * create-brika + the 7 plugins) to npm with provenance.
 *
 * Uses `npm publish --provenance`, NOT `bun publish`: Bun 1.3.14 has no
 * `--provenance` flag and no OIDC / trusted-publishing support.
 *
 * THE workspace: REWRITE. The internal `@brika/*` deps use the `workspace:`
 * protocol. `changeset version` does NOT rewrite it (only `changeset publish` /
 * a workspace-aware `bun|pnpm|yarn publish` would, and we use `npm publish` for
 * provenance), and `npm publish` ships `workspace:*` verbatim -- which no consumer
 * can install. So this script rewrites every `@brika/*` `workspace:` range to a
 * concrete `^<version>` (resolved from the sibling package's current version) ON
 * DISK just before `npm publish`, then restores the manifest. Mirrors the
 * manifest-rewrite in apps/build/src/npm-dist.ts.
 *
 * OIDC trusted publishing is per package NAME and must be registered on
 * npmjs.com BEFORE OIDC can attach provenance. A trusted publisher cannot exist
 * before the package does, so the FIRST publish of each new name uses the
 * `NPM_TOKEN` bootstrap fallback (written into ~/.npmrc in CI); OIDC takes over
 * on every subsequent release.
 *
 * Topological order (dependency-closure first): leaf libs (errors, grants, ipc,
 * serializable) -> flow, ui-kit -> sdk -> create-brika -> the 7 plugins. So a
 * dependent never publishes before the dependency it pins is live.
 *
 * Usage:
 *   bun run scripts/release-libs.ts                  # publish (tag auto: next for prereleases, else latest)
 *   bun run scripts/release-libs.ts --dry-run        # exercise every package, publish nothing
 *   bun run scripts/release-libs.ts --tag=next       # force a dist-tag (omit to auto-derive)
 */

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Glob } from 'bun';
import { z } from 'zod';

const REPO_ROOT = new URL('..', import.meta.url).pathname;

/**
 * Publish order. Each entry is a workspace dir relative to the repo root, listed
 * dependency-closure first so a dependent never precedes its dependency. The
 * `release-libs` guard test asserts this set equals the non-private published set.
 */
export const PUBLISH_ORDER: readonly string[] = [
  // Leaf libs (no @brika/* runtime deps within the shipped set).
  'packages/errors',
  'packages/grants',
  'packages/ipc',
  'packages/serializable',
  // Mid libs (depend on the leaves above).
  'packages/flow',
  'packages/ui-kit',
  // The facade every plugin pins.
  'packages/sdk',
  // Scaffold (bundles the CLI; pins @brika/sdk).
  'packages/create-brika',
  // Plugins (each pins @brika/sdk; published after it is live).
  'plugins/agent',
  'plugins/blocks-builtin',
  'plugins/matter',
  'plugins/spotify',
  'plugins/timer',
  'plugins/weather',
  'plugins/sil-electricity',
];

const manifestSchema = z
  .object({ name: z.string(), version: z.string(), private: z.boolean().optional() })
  .loose();

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  strict: false,
  options: {
    'dry-run': { type: 'boolean', default: false },
    tag: { type: 'string' },
  },
});

const dryRun = values['dry-run'] === true;

interface ShippedPackage {
  readonly dir: string;
  readonly name: string;
  readonly version: string;
}

/** Map every workspace package name to its current version, to resolve `workspace:` deps. */
async function workspaceVersions(): Promise<Map<string, string>> {
  const versions = new Map<string, string>();
  for (const pattern of [
    'apps/*/package.json',
    'packages/*/package.json',
    'plugins/*/package.json',
  ]) {
    for await (const rel of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
      const manifest = manifestSchema.parse(await Bun.file(join(REPO_ROOT, rel)).json());
      versions.set(manifest.name, manifest.version);
    }
  }
  return versions;
}

/** Read + validate a workspace manifest; returns null for a private package. */
async function readManifest(relDir: string): Promise<ShippedPackage | null> {
  const manifest = manifestSchema.parse(
    await Bun.file(join(REPO_ROOT, relDir, 'package.json')).json()
  );
  if (manifest.private === true) {
    console.log(`  skip ${relDir}: private`);
    return null;
  }
  return { dir: join(REPO_ROOT, relDir), name: manifest.name, version: manifest.version };
}

/**
 * Rewrite every `@brika/*` dep whose range is the `workspace:` protocol to a
 * concrete `^<version>`, preserving the file's formatting (textual replace, not
 * JSON round-trip). Throws if a workspace dep is not a known workspace package.
 * Returns the rewritten text, or null when nothing changed.
 */
function rewriteWorkspaceRanges(text: string, versions: Map<string, string>): string | null {
  let missing: string | null = null;
  const out = text.replace(
    /"(@brika\/[a-z0-9-]+)":\s*"workspace:[^"]*"/g,
    (_match, name: string) => {
      const version = versions.get(name);
      if (version === undefined) {
        missing = name;
        return _match;
      }
      return `"${name}": "^${version}"`;
    }
  );
  if (missing !== null) {
    throw new Error(`Cannot resolve workspace dependency "${missing}" (not a workspace package)`);
  }
  return out === text ? null : out;
}

/**
 * Default dist-tag: a prerelease version (containing `-`, e.g. `0.5.0-rc.1`)
 * routes to `next`; a stable version routes to `latest`. An explicit `--tag`
 * overrides both.
 */
function resolveTag(version: string): string {
  if (typeof values.tag === 'string' && values.tag !== '') {
    return values.tag;
  }
  return /-/.test(version) ? 'next' : 'latest';
}

/** True if `name@version` already exists on the registry (npm versions are immutable). */
function isPublished(name: string, version: string): boolean {
  const proc = Bun.spawnSync(['npm', 'view', `${name}@${version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return proc.exitCode === 0 && proc.stdout.toString().trim() === version;
}

/**
 * Publish one package: rewrite its `workspace:` ranges to concrete versions,
 * `npm publish`, then restore the manifest. Returns true on success or a
 * legitimate skip (already-published), false on a real publish failure.
 */
async function publishPackage(
  pkg: ShippedPackage,
  versions: Map<string, string>
): Promise<boolean> {
  const tag = resolveTag(pkg.version);

  // Idempotent: npm versions are immutable, so a re-run after a partial publish
  // must skip what is already live rather than 409 and wedge the release.
  if (!dryRun && isPublished(pkg.name, pkg.version)) {
    console.log(`  ${pkg.name}@${pkg.version} already published (skip)`);
    return true;
  }

  const manifestPath = join(pkg.dir, 'package.json');
  const original = await Bun.file(manifestPath).text();
  const rewritten = rewriteWorkspaceRanges(original, versions);
  if (rewritten?.includes('"workspace:')) {
    // A non-@brika workspace range survived the rewrite: never ship that.
    console.error(`  ${pkg.name}: unresolved workspace: range after rewrite; aborting.`);
    return false;
  }

  // --ignore-scripts: CI pre-builds the artifacts (sdk bin, create-brika dist);
  // a lifecycle script failing mid-loop would leave a partial publish of
  // immutable versions.
  const args = ['npm', 'publish', '--access', 'public', '--tag', tag, '--ignore-scripts'];
  // Provenance needs the OIDC id-token that only exists in GitHub Actions.
  if (process.env.GITHUB_ACTIONS === 'true') {
    args.push('--provenance');
  }
  if (dryRun) {
    args.push('--dry-run');
  }

  console.log(`  publish ${pkg.name}@${pkg.version}  tag:${tag}${dryRun ? '  (dry run)' : ''}`);
  try {
    if (rewritten !== null) {
      await Bun.write(manifestPath, rewritten);
    }
    const proc = Bun.spawnSync(args, { cwd: pkg.dir, stdout: 'inherit', stderr: 'inherit' });
    return proc.exitCode === 0;
  } finally {
    if (rewritten !== null) {
      await Bun.write(manifestPath, original);
    }
  }
}

async function main(): Promise<void> {
  console.log(`BRIKA library + plugin publish${dryRun ? '  (dry run)' : ''}`);

  const versions = await workspaceVersions();
  const packages: ShippedPackage[] = [];
  for (const relDir of PUBLISH_ORDER) {
    const pkg = await readManifest(relDir);
    if (pkg !== null) {
      packages.push(pkg);
    }
  }

  for (const pkg of packages) {
    if (!(await publishPackage(pkg, versions))) {
      // A real publish error aborts: do not push dependents whose dependency
      // failed to go live. The idempotent skip lets a fixed re-run resume.
      console.error(`Failed to publish ${pkg.name}@${pkg.version}. Aborting.`);
      process.exit(1);
    }
  }

  console.log(`Done. ${packages.length} package(s) processed${dryRun ? ' (dry run)' : ''}.`);
}

if (import.meta.main) {
  await main();
}
