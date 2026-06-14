import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { z } from 'zod';

/**
 * Publish-bundle e2e: prove the BUNDLED @brika/sdk is self-contained.
 *
 * The SDK publishes a tsdown bundle (`build:dist`) with its private @brika
 * closure (every `@brika/*` it lists as a devDependency, e.g. errors/flow/
 * grants/ipc/schema/serializable/ui-kit and testing in the `./testing` entry)
 * INLINED. A consumer installs only @brika/sdk + its real external deps (zod,
 * react peers); the closure never resolves from npm because it never appears in
 * the shipped bundle.
 *
 * This builds the real bundle and asserts (1) the entry artifacts exist, (2) no
 * private closure import survives in the emitted JS or `.d.ts`, and (3) the
 * react-free entries import under Bun. It is the runtime counterpart to the
 * static layout guard in published-dependency-closure.test.ts.
 */

const sdkDir = join(import.meta.dir, '..');
const distPkg = join(sdkDir, 'dist', 'pkg');

// Auto-detected, same source of truth as published-dependency-closure.test.ts:
// the closure is the SDK's `@brika/*` devDependencies (tsdown bundles devDeps,
// externalizes real deps/peers). None of them may survive as an import in the
// shipped bundle. A newly bundled @brika dep is covered with no list to update.
const sdkManifest = z
  .object({ devDependencies: z.record(z.string(), z.string()).default({}) })
  .loose()
  .parse(JSON.parse(readFileSync(join(sdkDir, 'package.json'), 'utf8')));
const CLOSURE_NAMES = Object.keys(sdkManifest.devDependencies).filter((d) =>
  d.startsWith('@brika/')
);
// Match a bare closure package or any of its subpaths (`@brika/ui-kit/icons`).
const CLOSURE_RE = new RegExp(
  `^(?:${CLOSURE_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:/|$)`
);
const REACT_FREE = ['ctx', 'sparks', 'schema', 'grants'];

let built = false;
function buildDist(): void {
  if (built) {
    return;
  }
  const proc = Bun.spawnSync(['bun', 'run', 'build:dist'], {
    cwd: sdkDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (proc.exitCode !== 0) {
    throw new Error(`build:dist failed:\n${proc.stderr.toString()}`);
  }
  built = true;
}

// Gated like the registry smoke e2es: spawning `build:dist` inside the parallel
// unit-test job starves timing-sensitive suites in other packages. Run it in the
// dedicated smoke-bin CI job via `bun run smoke:bin`.
describe.skipIf(process.env.BRIKA_BIN_SMOKE !== '1')(
  'published @brika/sdk bundle is self-contained',
  () => {
    test('build:dist emits the index entry (JS + types)', () => {
      buildDist();
      expect(existsSync(join(distPkg, 'index.js'))).toBe(true);
      expect(existsSync(join(distPkg, 'index.d.ts'))).toBe(true);
    }, 60_000);

    test('no private closure import survives in the bundled JS or types', async () => {
      buildDist();
      const importRe = /^\s*(?:import|export)\b[^;]*?\bfrom\s*['"](@brika\/[a-z/-]+)['"]/;
      const leaks: string[] = [];
      for await (const rel of new Glob('**/*.{js,d.ts}').scan({ cwd: distPkg })) {
        for (const line of readFileSync(join(distPkg, rel), 'utf8').split('\n')) {
          const m = importRe.exec(line);
          if (m?.[1] !== undefined && CLOSURE_RE.test(m[1])) {
            leaks.push(`${rel}: ${m[1]}`);
          }
        }
      }
      expect(leaks).toEqual([]);
    }, 60_000);

    test('react-free bundled entries import under Bun', () => {
      buildDist();
      const imports = REACT_FREE.map(
        (e) => `await import(${JSON.stringify(join(distPkg, `${e}.js`))});`
      ).join(' ');
      const run = Bun.spawnSync(['bun', '-e', `${imports} console.log('IMPORT-OK');`], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      // exitCode catches ANY import failure regardless of message wording; the
      // IMPORT-OK marker confirms every dynamic import actually resolved.
      expect(run.exitCode).toBe(0);
      expect(run.stdout.toString()).toContain('IMPORT-OK');
    }, 30_000);
  }
);
