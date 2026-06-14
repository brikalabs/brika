import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

/**
 * Publish-bundle e2e: prove the BUNDLED @brika/sdk is self-contained.
 *
 * The SDK publishes a tsdown bundle (`build:dist`) with its private runtime
 * closure (@brika/errors/flow/grants/ipc/serializable/ui-kit) INLINED. A consumer
 * installs only @brika/sdk + its real external deps (zod, react peers); the
 * closure never resolves from npm because it never appears in the shipped bundle.
 *
 * This builds the real bundle and asserts (1) the entry artifacts exist, (2) no
 * private closure import survives in the emitted JS or `.d.ts`, and (3) the
 * react-free entries import under Bun. It is the runtime counterpart to the
 * static layout guard in published-dependency-closure.test.ts.
 */

const sdkDir = join(import.meta.dir, '..');
const distPkg = join(sdkDir, 'dist', 'pkg');
const CLOSURE_RE = /@brika\/(errors|flow|grants|ipc|serializable|ui-kit|schema)\b/;
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
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
  });
  if (proc.exitCode !== 0) {
    throw new Error(`build:dist failed:\n${proc.stderr.toString()}`);
  }
  built = true;
}

describe('published @brika/sdk bundle is self-contained', () => {
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
    expect(run.stderr.toString()).not.toContain('Cannot find module');
    expect(run.stdout.toString()).toContain('IMPORT-OK');
  }, 30_000);
});
