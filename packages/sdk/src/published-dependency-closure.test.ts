import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Guards @brika/sdk's BUNDLED publish layout.
 *
 * The SDK publishes a self-contained bundle (tsdown `build:dist`): its private
 * runtime closure is INLINED into `dist/pkg`, so those packages stay
 * `devDependencies` (build-time only) and never become a consumer's install
 * dependency. The publisher repoints `exports` src -> dist at publish; dev keeps
 * committed `exports` -> `src` and resolves the closure via workspace links.
 * See packages/sdk/tsdown.config.ts + scripts/release-libs.ts (bundleExports).
 *
 * The runtime counterpart (build the bundle, assert it is leak-free + imports) is
 * packages/sdk/src/closure-install.e2e.integration.test.ts.
 */

// The private packages inlined into the published bundle. Keep in sync with the
// CLOSURE_RE leak scan in closure-install.e2e.integration.test.ts.
const CLOSURE = [
  '@brika/errors',
  '@brika/flow',
  '@brika/grants',
  '@brika/ipc',
  '@brika/schema',
  '@brika/serializable',
  '@brika/ui-kit',
];

const sdkDir = join(import.meta.dir, '..');
const repoRoot = join(sdkDir, '..', '..');

const manifest = z
  .object({
    dependencies: z.record(z.string(), z.string()).default({}),
    devDependencies: z.record(z.string(), z.string()).default({}),
  })
  .loose()
  .parse(JSON.parse(readFileSync(join(sdkDir, 'package.json'), 'utf8')));

describe('@brika/sdk bundled publish layout', () => {
  test.each(CLOSURE)('%s is bundled (a devDependency), not a runtime dependency', (name) => {
    expect(manifest.devDependencies[name]).toBeDefined();
    expect(manifest.dependencies[name]).toBeUndefined();
  });

  test('runtime dependencies carry no @brika package (the closure is inlined)', () => {
    const brikaRuntimeDeps = Object.keys(manifest.dependencies).filter((d) =>
      d.startsWith('@brika/')
    );
    expect(brikaRuntimeDeps).toEqual([]);
  });

  test('the inlined closure packages are private (never published standalone)', () => {
    for (const name of CLOSURE) {
      const dir = name.replace('@brika/', '');
      const m = z
        .object({ private: z.boolean().optional() })
        .loose()
        .parse(JSON.parse(readFileSync(join(repoRoot, 'packages', dir, 'package.json'), 'utf8')));
      expect(m.private).toBe(true);
    }
  });
});
