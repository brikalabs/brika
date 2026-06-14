import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { z } from 'zod';

/**
 * Guards @brika/sdk's BUNDLED publish layout.
 *
 * The SDK publishes a self-contained bundle (tsdown `build:dist`): its private
 * runtime closure is INLINED into `dist/pkg`, so those packages stay
 * `devDependencies` (build-time only) and never become a consumer's install
 * dependency. The publisher repoints `exports` src -> dist at publish; dev keeps
 * committed `exports` -> `src` and resolves the closure via workspace links.
 * See packages/sdk/tsdown.config.ts + packages/workspace-tools/src/release-libs.ts (bundleExports).
 *
 * The runtime counterpart (build the bundle, assert it is leak-free + imports) is
 * packages/sdk/src/closure-install.e2e.integration.test.ts.
 */

const sdkDir = join(import.meta.dir, '..');
const repoRoot = join(sdkDir, '..', '..');

const manifest = z
  .object({
    dependencies: z.record(z.string(), z.string()).default({}),
    devDependencies: z.record(z.string(), z.string()).default({}),
  })
  .loose()
  .parse(JSON.parse(readFileSync(join(sdkDir, 'package.json'), 'utf8')));

/**
 * The closure is AUTO-DETECTED, not hardcoded: it is every `@brika/*` package the
 * SDK lists as a `devDependency`. tsdown bundles `devDependencies` inline (it
 * externalizes real `dependencies` and `peerDependencies`), so these are exactly
 * the @brika packages folded into the published bundle, and each must be private
 * and absent from the shipped runtime. Deriving from the manifest means a newly
 * bundled @brika dep is covered automatically, with no list to keep in sync.
 */
const CLOSURE = Object.keys(manifest.devDependencies)
  .filter((name) => name.startsWith('@brika/'))
  .sort((a, b) => a.localeCompare(b));

/** name -> private, resolved by scanning the workspace (dir name may differ from package name). */
const workspacePrivacy = new Map<string, boolean>();
for (const pattern of [
  'packages/*/package.json',
  'plugins/*/package.json',
  'apps/*/package.json',
]) {
  for (const rel of new Glob(pattern).scanSync({ cwd: repoRoot })) {
    const pkg = z
      .object({ name: z.string().optional(), private: z.boolean().optional() })
      .loose()
      .parse(JSON.parse(readFileSync(join(repoRoot, rel), 'utf8')));
    if (pkg.name !== undefined) {
      workspacePrivacy.set(pkg.name, pkg.private === true);
    }
  }
}

describe('@brika/sdk bundled publish layout', () => {
  test('the SDK has at least one bundled @brika dependency to guard', () => {
    expect(CLOSURE.length).toBeGreaterThan(0);
  });

  test.each(CLOSURE)('%s is a devDependency only, never a runtime dependency', (name) => {
    expect(manifest.dependencies[name]).toBeUndefined();
  });

  test('runtime dependencies carry no @brika package (the closure is inlined)', () => {
    const brikaRuntimeDeps = Object.keys(manifest.dependencies).filter((d) =>
      d.startsWith('@brika/')
    );
    expect(brikaRuntimeDeps).toEqual([]);
  });

  test.each(CLOSURE)('%s is private (never published standalone)', (name) => {
    expect(workspacePrivacy.get(name)).toBe(true);
  });
});
