import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Glob } from 'bun';
import { z } from 'zod';

/**
 * Guards @brika/sdk's published dependency layout.
 *
 * The SDK ships raw `.ts` (its `exports` point at `./src/*.ts`), so the package
 * manager must resolve the plugin-facing runtime closure from npm. If a closure
 * package sits in `devDependencies`, an npm-installed plugin crashes on first
 * load (value import) or fails to typecheck (type import).
 *
 * RUNTIME_CLOSURE: @brika/* reached from the plugin-facing exports (the `.`
 * entry + blocks/grants/ctx/ui-kit/i18n surface). MUST be `dependencies`.
 * Verified value imports: @brika/flow (src/index.ts `export *`,
 * src/blocks/reactive.ts), @brika/ui-kit (src/context/i18n.ts). Type imports:
 * @brika/serializable (src/blocks/types.ts, src/blocks/reactive-define.ts).
 *
 * BUNDLED_OR_DEV: the `brika` author CLI (@brika/cli, @brika/compiler,
 * @brika/schema) is inlined into `dist/bin/brika.js` by `build:bin`, and
 * @brika/testing backs the dev-only `./testing` export. These MUST stay
 * `devDependencies`: promoting them would force publishing private packages
 * (a forbidden public->private dependency). See docs/npm-publishing-strategy.md.
 */

const RUNTIME_CLOSURE = [
  '@brika/errors',
  '@brika/flow',
  '@brika/grants',
  '@brika/ipc',
  '@brika/serializable',
  '@brika/ui-kit',
];

const BUNDLED_OR_DEV = ['@brika/cli', '@brika/compiler', '@brika/schema', '@brika/testing'];

const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
});

const manifest = manifestSchema.parse(
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'))
);

describe('@brika/sdk published dependency closure', () => {
  test.each(RUNTIME_CLOSURE)('%s is a runtime dependency, not a devDependency', (name) => {
    expect(manifest.dependencies[name]).toBeDefined();
    expect(manifest.devDependencies[name]).toBeUndefined();
  });

  test.each(
    BUNDLED_OR_DEV
  )('%s stays a devDependency (bundled into the bin or dev-only)', (name) => {
    expect(manifest.devDependencies[name]).toBeDefined();
    expect(manifest.dependencies[name]).toBeUndefined();
  });

  test('every @brika/* imported in src is categorized (no new undeclared closure)', async () => {
    const srcDir = join(import.meta.dir);
    const known = new Set([...RUNTIME_CLOSURE, ...BUNDLED_OR_DEV, '@brika/sdk']);
    const importRe = /from\s*['"](@brika\/[a-z0-9-]+)/g;
    const seen = new Set<string>();
    for await (const rel of new Glob('**/*.{ts,tsx}').scan({ cwd: srcDir })) {
      if (/\.(test|spec)\.tsx?$/.test(rel)) {
        continue;
      }
      const text = readFileSync(join(srcDir, rel), 'utf8');
      for (const m of text.matchAll(importRe)) {
        if (m[1] !== undefined) {
          seen.add(m[1]);
        }
      }
    }
    // A new @brika import that is in neither list means the closure lists are stale.
    const uncategorized = [...seen].filter((name) => !known.has(name)).sort();
    expect(uncategorized).toEqual([]);
  });
});

/**
 * Guards the published EXPORT surface. The SDK ships raw `.ts`, so any public
 * subpath export whose source transitively value-imports a PRIVATE @brika
 * package is unresolvable for an npm consumer. The author CLI does exactly that
 * (it pulls in @brika/cli/compiler/schema), so it is confined to the
 * `./internal/cli` subpath that the publisher strips. These tests prevent that
 * leak (and the strip) from regressing.
 */
describe('@brika/sdk published export surface', () => {
  const sdkDir = join(import.meta.dir, '..');
  const repoRoot = join(sdkDir, '..', '..');

  const exportsMap = z
    .object({ exports: z.record(z.string(), z.string()) })
    .loose()
    .parse(JSON.parse(readFileSync(join(sdkDir, 'package.json'), 'utf8'))).exports;

  // Privacy of every workspace @brika package.
  const privacy = new Map<string, boolean>();
  for (const rel of new Glob('{packages,plugins}/*/package.json').scanSync({ cwd: repoRoot })) {
    const m = z
      .object({ name: z.string(), private: z.boolean().optional() })
      .loose()
      .parse(JSON.parse(readFileSync(join(repoRoot, rel), 'utf8')));
    privacy.set(m.name, m.private === true);
  }

  /** Resolve an extensionless relative import to a concrete source file. */
  function resolveRelative(spec: string, fromFile: string): string | null {
    const base = join(dirname(fromFile), spec);
    const candidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }

  const importRe = /(?:import|export)\b([^;]*?)\bfrom\s*['"]([^'"]+)['"]/g;

  /** Every @brika/* package value-imported transitively from the given entry files. */
  function reachedBrikaPackages(entries: readonly string[]): Set<string> {
    const reached = new Set<string>();
    const seen = new Set<string>();
    const queue = [...entries];
    while (queue.length > 0) {
      const file = queue.pop();
      if (file === undefined || seen.has(file)) {
        continue;
      }
      seen.add(file);
      for (const match of readFileSync(file, 'utf8').matchAll(importRe)) {
        const clause = match[1] ?? '';
        const spec = match[2] ?? '';
        if (/^\s*type\b/.test(clause)) {
          continue; // type-only imports are erased at runtime
        }
        if (spec.startsWith('.')) {
          const resolved = resolveRelative(spec, file);
          if (resolved !== null) {
            queue.push(resolved);
          }
        } else if (spec.startsWith('@brika/')) {
          reached.add(spec.split('/').slice(0, 2).join('/'));
        }
      }
    }
    return reached;
  }

  test('the author CLI is reachable only via the ./internal/cli subpath', () => {
    expect(exportsMap['./internal/cli']).toBeDefined();
    const publicKeys = Object.keys(exportsMap).filter((key) => !key.startsWith('./internal/'));
    expect(publicKeys).not.toContain('./cli');
  });

  test('no public export transitively value-imports a private @brika package', () => {
    const entries = Object.entries(exportsMap)
      .filter(([key, target]) => !key.startsWith('./internal/') && /\.tsx?$/.test(target))
      .map(([, target]) => join(sdkDir, target))
      .filter((path) => existsSync(path));
    const privateReached = [...reachedBrikaPackages(entries)]
      .filter((name) => privacy.get(name) === true)
      .sort();
    expect(privateReached).toEqual([]);
  });
});
