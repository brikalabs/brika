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

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Glob } from 'bun';
import { z } from 'zod';

const REPO_ROOT = new URL('..', import.meta.url).pathname;

const manifestSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    private: z.boolean().optional(),
    dependencies: z.record(z.string(), z.string()).default({}),
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

interface WorkspacePackage {
  /** Workspace dir relative to the repo root. */
  readonly relDir: string;
  readonly name: string;
  readonly version: string;
  readonly isPrivate: boolean;
  /** `@brika/*` runtime dependency names (for the publish topo-sort). */
  readonly brikaDeps: readonly string[];
}

/** Scan the workspace once: each package's dir, version, privacy, and @brika deps. */
async function discoverWorkspace(): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = [];
  for (const pattern of [
    'packages/*/package.json',
    'plugins/*/package.json',
    'apps/*/package.json',
  ]) {
    for await (const rel of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
      const manifest = manifestSchema.parse(await Bun.file(join(REPO_ROOT, rel)).json());
      packages.push({
        relDir: rel.slice(0, -'/package.json'.length),
        name: manifest.name,
        version: manifest.version,
        isPrivate: manifest.private === true,
        brikaDeps: Object.keys(manifest.dependencies).filter((d) => d.startsWith('@brika/')),
      });
    }
  }
  return packages;
}

/**
 * The published packages in dependency order, DERIVED from each package's
 * `private` flag (is it published) and its `@brika/*` runtime deps (the order):
 * a topological sort so a dependency is always published before its dependents.
 * No hardcoded list to maintain. Throws on a dependency cycle.
 */
export function publishOrder(workspace: readonly WorkspacePackage[]): WorkspacePackage[] {
  const byName = new Map(workspace.map((p) => [p.name, p]));
  const published = workspace
    .filter((p) => !p.isPrivate)
    .sort((a, b) => a.name.localeCompare(b.name));
  const publishedNames = new Set(published.map((p) => p.name));

  const ordered: WorkspacePackage[] = [];
  const done = new Set<string>();
  const visit = (pkg: WorkspacePackage, stack: Set<string>): void => {
    if (done.has(pkg.name)) {
      return;
    }
    if (stack.has(pkg.name)) {
      throw new Error(`Dependency cycle through ${pkg.name}`);
    }
    stack.add(pkg.name);
    for (const depName of pkg.brikaDeps) {
      // Edges to private deps do not constrain the published order.
      if (!publishedNames.has(depName)) {
        continue;
      }
      const dep = byName.get(depName);
      if (dep !== undefined) {
        visit(dep, stack);
      }
    }
    stack.delete(pkg.name);
    done.add(pkg.name);
    ordered.push(pkg); // post-order: a package lands after the deps it pins
  };
  for (const pkg of published) {
    visit(pkg, new Set());
  }
  return ordered;
}

/** The published packages in dependency order (fully derived; for the guard test). */
export async function discoverPublishOrder(): Promise<WorkspacePackage[]> {
  return publishOrder(await discoverWorkspace());
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

const exportsManifestSchema = z
  .object({ exports: z.record(z.string(), z.unknown()).optional() })
  .loose();

/**
 * Drop every `./internal/*` exports subpath from the published manifest. These
 * are workspace-only entries (they resolve the private build toolchain, e.g.
 * `@brika/sdk/internal/cli`), so importing one from npm would fail to resolve a
 * private package. The source files stay in the tarball as harmless dead code;
 * only the resolvable public surface is trimmed. Returns the rewritten JSON
 * (normalized, restored after publish), or null when there are no such entries.
 */
export function stripInternalExports(text: string): string | null {
  const parsed = exportsManifestSchema.safeParse(JSON.parse(text));
  if (!parsed.success || parsed.data.exports === undefined) {
    return null;
  }
  const map = parsed.data.exports;
  const internal = Object.keys(map).filter((key) => key.startsWith('./internal/'));
  if (internal.length === 0) {
    return null;
  }
  for (const key of internal) {
    delete map[key];
  }
  return `${JSON.stringify(parsed.data, null, 2)}\n`;
}

const bundleManifestSchema = z
  .object({
    scripts: z.record(z.string(), z.string()).default({}),
    exports: z.record(z.string(), z.unknown()).default({}),
  })
  .loose();

/** A package opts into bundle-publish by having a `build:dist` script (tsdown). */
function isBundlePublished(text: string): boolean {
  const parsed = bundleManifestSchema.safeParse(JSON.parse(text));
  return parsed.success && parsed.data.scripts['build:dist'] !== undefined;
}

/**
 * Repoint every source-backed public export at the built `dist/pkg` bundle (JS +
 * types). The workspace keeps committed `exports` -> `src` for zero-build dev;
 * this runs ONLY at publish, after `build:dist`, so npm consumers get the
 * self-contained bundle (private closure inlined) instead of raw `.ts`. Entry
 * names mirror tsdown's derivation (`.` -> index, `./x` -> x). Returns the
 * rewritten JSON, or null when nothing is source-backed.
 */
export function bundleExports(text: string): string | null {
  const parsed = bundleManifestSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    return null;
  }
  const map = parsed.data.exports;
  let changed = false;
  for (const [key, target] of Object.entries(map)) {
    if (typeof target !== 'string' || !target.startsWith('./src/') || !target.endsWith('.ts')) {
      continue;
    }
    const name = key === '.' ? 'index' : key.slice(2);
    map[key] = { types: `./dist/pkg/${name}.d.ts`, default: `./dist/pkg/${name}.js` };
    changed = true;
  }
  return changed ? `${JSON.stringify(parsed.data, null, 2)}\n` : null;
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
  pkg: WorkspacePackage,
  versions: Map<string, string>
): Promise<boolean> {
  const tag = resolveTag(pkg.version);

  // Idempotent: npm versions are immutable, so a re-run after a partial publish
  // must skip what is already live rather than 409 and wedge the release.
  if (!dryRun && isPublished(pkg.name, pkg.version)) {
    console.log(`  ${pkg.name}@${pkg.version} already published (skip)`);
    return true;
  }

  const dir = join(REPO_ROOT, pkg.relDir);
  const manifestPath = join(dir, 'package.json');
  const original = await Bun.file(manifestPath).text();
  const rewritten = rewriteWorkspaceRanges(original, versions);
  if (rewritten?.includes('"workspace:')) {
    // A non-@brika workspace range survived the rewrite: never ship that.
    console.error(`  ${pkg.name}: unresolved workspace: range after rewrite; aborting.`);
    return false;
  }
  // Trim workspace-only `./internal/*` exports from the published manifest. The
  // strip runs on top of the workspace-range rewrite, so publishText carries both.
  const stripped = stripInternalExports(rewritten ?? original);
  let publishText = stripped ?? rewritten;

  // Bundle-published packages (build:dist script): build the dist, then repoint
  // exports src -> dist so consumers get the self-contained bundle. The build
  // must run before publish since release-libs uses --ignore-scripts.
  if (isBundlePublished(original)) {
    console.log(`  ${pkg.name}: building publish bundle (build:dist)`);
    const build = Bun.spawnSync(['bun', 'run', 'build:dist'], {
      cwd: dir,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (build.exitCode !== 0) {
      console.error(`  ${pkg.name}: build:dist failed; aborting.`);
      return false;
    }
    publishText = bundleExports(publishText ?? original) ?? publishText;
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

  // Packages list LICENSE in files[] but keep only the root LICENSE on disk; copy
  // it in for the publish so npm shows the license, then remove the copy.
  const licensePath = join(dir, 'LICENSE');
  const rootLicense = join(REPO_ROOT, 'LICENSE');
  const addLicense = !existsSync(licensePath) && existsSync(rootLicense);

  console.log(`  publish ${pkg.name}@${pkg.version}  tag:${tag}${dryRun ? '  (dry run)' : ''}`);
  try {
    if (publishText !== null) {
      await Bun.write(manifestPath, publishText);
    }
    if (addLicense) {
      await Bun.write(licensePath, Bun.file(rootLicense));
    }
    const proc = Bun.spawnSync(args, { cwd: dir, stdout: 'inherit', stderr: 'inherit' });
    return proc.exitCode === 0;
  } finally {
    if (publishText !== null) {
      await Bun.write(manifestPath, original);
    }
    if (addLicense) {
      await rm(licensePath, { force: true });
    }
  }
}

async function main(): Promise<void> {
  console.log(`BRIKA library + plugin publish${dryRun ? '  (dry run)' : ''}`);

  const workspace = await discoverWorkspace();
  const versions = new Map(workspace.map((p) => [p.name, p.version]));
  const order = publishOrder(workspace);
  console.log(`  ${order.length} packages: ${order.map((p) => p.name).join(', ')}`);

  for (const pkg of order) {
    if (!(await publishPackage(pkg, versions))) {
      // A real publish error aborts: do not push dependents whose dependency
      // failed to go live. The idempotent skip lets a fixed re-run resume.
      console.error(`Failed to publish ${pkg.name}@${pkg.version}. Aborting.`);
      process.exit(1);
    }
  }

  console.log(`Done. ${order.length} package(s) processed${dryRun ? ' (dry run)' : ''}.`);
}

if (import.meta.main) {
  await main();
}
