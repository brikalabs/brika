#!/usr/bin/env bun

/**
 * The AUTOMATED publisher entry: ship the public packages (the @brika/sdk
 * runtime closure + create-brika + the 7 plugins) to npm in dependency order,
 * non-interactively, for CI. The interactive sibling is ./publish.ts; both
 * delegate the per-package mechanism (manifest rewrite, idempotent skip,
 * `npm publish` flags, provenance) to the shared ./publish-package.ts.
 *
 * This file owns only what is specific to the automated release: discovering the
 * workspace, deriving the topological publish order, and walking it. The order
 * is a topological sort over each package's `@brika/*` runtime deps, so a
 * dependent never publishes before a dependency it pins is live.
 *
 * The published set is `@brika/sdk`, `@brika/testing`, `create-brika`, and the
 * 7 plugins (the @brika/sdk runtime closure -- errors/flow/grants/ipc/
 * serializable/ui-kit/schema -- is `private` and inlined by `build:dist`, never
 * published).
 *
 * OIDC trusted publishing is per package NAME and must be registered on
 * npmjs.com BEFORE OIDC can attach provenance. A trusted publisher cannot exist
 * before the package does, so the FIRST publish of each new name uses the
 * `NPM_TOKEN` bootstrap fallback (written into ~/.npmrc in CI); OIDC takes over
 * on every subsequent release.
 *
 * Usage:
 *   bun run packages/workspace-tools/src/release-libs.ts                  # publish (tag auto: next for prereleases, else latest)
 *   bun run packages/workspace-tools/src/release-libs.ts --dry-run        # exercise every package, publish nothing
 *   bun run packages/workspace-tools/src/release-libs.ts --tag=next       # force a dist-tag (omit to auto-derive)
 */

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Glob } from 'bun';
import { z } from 'zod';
import { publishPackage, resolveTag } from './publish-package';

// Anchored to this file's location, not process.cwd(): the changeset-config
// guard imports discoverPublishOrder, and test-ci runs each suite with cwd set
// to the package dir, so cwd would not be the repo root there.
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');

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

/** The explicit `--tag` override, or undefined to auto-derive per package. */
const explicitTag = typeof values.tag === 'string' ? values.tag : undefined;

async function main(): Promise<void> {
  console.log(`BRIKA library + plugin publish${dryRun ? '  (dry run)' : ''}`);

  const workspace = await discoverWorkspace();
  const versions = new Map(workspace.map((p) => [p.name, p.version]));
  const order = publishOrder(workspace);
  console.log(`  ${order.length} packages: ${order.map((p) => p.name).join(', ')}`);

  for (const pkg of order) {
    const tag = resolveTag(pkg.version, explicitTag);
    console.log(`  publish ${pkg.name}@${pkg.version}  tag:${tag}${dryRun ? '  (dry run)' : ''}`);
    const outcome = await publishPackage(
      { dir: join(REPO_ROOT, pkg.relDir), name: pkg.name, version: pkg.version },
      { versions, repoRoot: REPO_ROOT, dryRun, tag: explicitTag }
    );
    if (outcome.status === 'skipped') {
      console.log(`  ${pkg.name}@${pkg.version} already published (skip)`);
      continue;
    }
    if (outcome.status === 'failed') {
      // A real publish error aborts: do not push dependents whose dependency
      // failed to go live. The idempotent skip lets a fixed re-run resume.
      console.error(`Failed to publish ${pkg.name}@${pkg.version}: ${outcome.reason}. Aborting.`);
      process.exit(1);
    }
  }

  console.log(`Done. ${order.length} package(s) processed${dryRun ? ' (dry run)' : ''}.`);
}

if (import.meta.main) {
  await main();
}
