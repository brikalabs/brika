#!/usr/bin/env bun
/**
 * Publish the shipped public packages (the @brika/sdk runtime closure +
 * create-brika + the 7 plugins) to npm with provenance.
 *
 * Uses `npm publish --provenance`, NOT `bun publish`: Bun 1.3.14 has no
 * `--provenance` flag and no OIDC / trusted-publishing support. This mirrors the
 * idempotency / order / provenance pattern in `apps/build/src/npm-dist.ts`.
 *
 * OIDC trusted publishing is per package NAME and must be registered on
 * npmjs.com BEFORE OIDC can attach provenance. A trusted publisher cannot exist
 * before the package does, so the FIRST publish of each new name uses the
 * `NPM_TOKEN` bootstrap fallback (write the token into ~/.npmrc in CI); OIDC
 * takes over on every subsequent release. Each of these 15 names needs the repo
 * `brikalabs/brika`, the publishing workflow filename, and any gating
 * environment registered once on npmjs.com.
 *
 * `changeset version` has already rewritten every `workspace:*` range to a
 * concrete `^x.y.z` before this runs (npm publish does NOT rewrite them), so the
 * manifests on disk are publish-ready.
 *
 * Topological order (dependency-closure first): leaf libs (errors, grants, ipc,
 * serializable) -> flow, ui-kit -> sdk -> create-brika -> the 7 plugins. So a
 * dependent never publishes before the dependency it pins is live.
 *
 * Usage:
 *   bun run scripts/release-libs.ts                  # publish (latest / next)
 *   bun run scripts/release-libs.ts --dry-run        # exercise every package
 *   bun run scripts/release-libs.ts --tag=next       # force a dist-tag
 */

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';

const REPO_ROOT = new URL('..', import.meta.url).pathname;

/**
 * Publish order. Each entry is a workspace dir relative to the repo root, listed
 * dependency-closure first so a dependent never precedes its dependency.
 */
const PUBLISH_ORDER: readonly string[] = [
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

const depMapSchema = z.record(z.string(), z.string()).optional();

const manifestSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    private: z.boolean().optional(),
    dependencies: depMapSchema,
    peerDependencies: depMapSchema,
    optionalDependencies: depMapSchema,
  })
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
  /** Dependency names still carrying a `workspace:` range (must be empty to publish). */
  readonly workspaceRanges: readonly string[];
}

/** Names of deps whose range is the `workspace:` protocol npm cannot resolve. */
function workspaceRangeDeps(manifest: z.infer<typeof manifestSchema>): string[] {
  const maps = [manifest.dependencies, manifest.peerDependencies, manifest.optionalDependencies];
  const names = new Set<string>();
  for (const map of maps) {
    for (const [name, range] of Object.entries(map ?? {})) {
      if (range.startsWith('workspace:')) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

/** Read + validate a workspace manifest; returns null for a private package. */
async function readManifest(relDir: string): Promise<ShippedPackage | null> {
  const path = join(REPO_ROOT, relDir, 'package.json');
  const raw: unknown = await Bun.file(path).json();
  const manifest = manifestSchema.parse(raw);
  if (manifest.private === true) {
    console.log(`  skip ${relDir}: private`);
    return null;
  }
  return {
    dir: join(REPO_ROOT, relDir),
    name: manifest.name,
    version: manifest.version,
    workspaceRanges: workspaceRangeDeps(manifest),
  };
}

/**
 * Default dist-tag: a prerelease version (one containing `-`, e.g. `0.5.0-rc.1`)
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
 * Publish one package. Returns true on success or a legitimate skip
 * (already-published), false on a real publish failure.
 */
function publishPackage(pkg: ShippedPackage): boolean {
  const tag = resolveTag(pkg.version);

  // Idempotent: npm versions are immutable, so a re-run after a partial publish
  // must skip what is already live rather than 409 and wedge the release.
  // Skipped only for real publishes; a dry run still exercises every package.
  if (!dryRun && isPublished(pkg.name, pkg.version)) {
    console.log(`  ${pkg.name}@${pkg.version} already published (skip)`);
    return true;
  }

  const args = ['npm', 'publish', '--access', 'public', '--tag', tag];
  // Provenance needs the OIDC id-token that only exists in GitHub Actions.
  // Passing --provenance anywhere else (e.g. a local dry run) makes npm error
  // before it packs, so gate it on the CI environment.
  if (process.env.GITHUB_ACTIONS === 'true') {
    args.push('--provenance');
  }
  if (dryRun) {
    args.push('--dry-run');
  }
  console.log(`  publish ${pkg.name}@${pkg.version}  tag:${tag}${dryRun ? '  (dry run)' : ''}`);
  const proc = Bun.spawnSync(args, { cwd: pkg.dir, stdout: 'inherit', stderr: 'inherit' });
  return proc.exitCode === 0;
}

async function main(): Promise<void> {
  console.log(`BRIKA library + plugin publish${dryRun ? '  (dry run)' : ''}`);

  const packages: ShippedPackage[] = [];
  for (const relDir of PUBLISH_ORDER) {
    const pkg = await readManifest(relDir);
    if (pkg !== null) {
      packages.push(pkg);
    }
  }

  // Preflight: npm does NOT rewrite `workspace:*` ranges, and `npm publish
  // --dry-run` packs them WITHOUT error, so a rehearsal would pass while the real
  // publish ships a manifest no consumer can install. `changeset version` rewrites
  // these to concrete `^x.y.z`; abort here if it has not run yet.
  const unresolved = packages.filter((p) => p.workspaceRanges.length > 0);
  if (unresolved.length > 0) {
    console.error('Refusing to publish: these manifests still carry workspace: ranges.');
    console.error('Run `changeset version` (or `bun run version-packages`) first so the');
    console.error('workspace: protocol is rewritten to concrete ranges.');
    for (const p of unresolved) {
      console.error(`  ${p.name}: ${p.workspaceRanges.join(', ')}`);
    }
    process.exit(1);
  }

  for (const pkg of packages) {
    if (!publishPackage(pkg)) {
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
