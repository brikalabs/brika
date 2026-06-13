import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

/**
 * Closure-install e2e: prove the PUBLISHED @brika/sdk is self-contained.
 *
 * @brika/sdk ships raw `.ts`, so an npm consumer must be able to resolve its
 * entire runtime closure from the SDK's *declared* dependencies. This packs the
 * SDK + closure to tarballs and installs them into an isolated consumer the way
 * npm would (`overrides` redirect the internal `workspace:*` ranges to the local
 * tarballs, mirroring what `changeset version` does at release time), then
 * imports the react-free SDK subpaths under Bun.
 *
 * If any closure package were declared in `devDependencies` instead of
 * `dependencies` (the class of bug PR 1 fixed: `@brika/flow` was a devDep), it
 * would NOT land in the SDK's published deps, npm would not install it, and the
 * import below would throw `Cannot find module '@brika/flow'`. This is the
 * runtime counterpart to `published-dependency-closure.test.ts` (which checks the
 * declaration statically): here we install + import the real packed artifacts.
 *
 * Network: a single small fetch (zod, the SDK's only external runtime dep). The
 * ui-kit closure member is installed but not imported (it needs React peers); its
 * resolution is covered by the static guard and the verdaccio/Docker acceptance
 * e2e.
 */

const PACKAGES_DIR = resolve(import.meta.dir, '..', '..');

/** SDK closure members (the @brika/* packages @brika/sdk depends on at runtime). */
const CLOSURE = ['errors', 'flow', 'grants', 'ipc', 'serializable', 'ui-kit'];

/** React-free SDK subpaths whose import exercises the closure without needing React. */
const REACT_FREE_SUBPATHS = [
  '@brika/sdk/ctx', // -> @brika/errors, @brika/grants, @brika/ipc
  '@brika/sdk/sparks', // -> @brika/flow
  '@brika/sdk/schema', // -> @brika/serializable
  '@brika/sdk/grants', // -> @brika/grants
];

const packResultSchema = z.array(z.object({ filename: z.string() })).min(1);

/** `npm pack` a package dir into `dest`, returning the tarball's absolute path. */
function pack(pkgDir: string, dest: string): string {
  const proc = Bun.spawnSync(
    ['npm', 'pack', '--json', '--ignore-scripts', '--pack-destination', dest],
    { cwd: pkgDir, stdout: 'pipe', stderr: 'pipe' }
  );
  if (proc.exitCode !== 0) {
    throw new Error(`npm pack failed in ${pkgDir}: ${proc.stderr.toString()}`);
  }
  const first = packResultSchema.parse(JSON.parse(proc.stdout.toString()))[0];
  if (first === undefined) {
    throw new Error(`npm pack produced no tarball in ${pkgDir}`);
  }
  return join(dest, first.filename);
}

let workdir: string;
let consumer: string;

beforeAll(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'brika-closure-'));
  const tarballs = join(workdir, 'tarballs');
  consumer = join(workdir, 'consumer');
  await Bun.write(join(tarballs, '.keep'), '');

  const sdkTarball = pack(join(PACKAGES_DIR, 'sdk'), tarballs);
  const overrides: Record<string, string> = {};
  for (const name of CLOSURE) {
    overrides[`@brika/${name}`] = `file:${pack(join(PACKAGES_DIR, name), tarballs)}`;
  }

  await Bun.write(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'closure-consumer',
        version: '0.0.0',
        private: true,
        dependencies: { '@brika/sdk': `file:${sdkTarball}` },
        overrides,
      },
      null,
      2
    )}\n`
  );

  const install = Bun.spawnSync(['npm', 'install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: consumer,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (install.exitCode !== 0) {
    throw new Error(`npm install failed: ${install.stderr.toString()}`);
  }
}, 180_000);

afterAll(async () => {
  if (workdir) {
    await rm(workdir, { recursive: true, force: true });
  }
});

describe('published @brika/sdk closure installs and imports in isolation', () => {
  test('every declared closure package is installed from the published deps', () => {
    for (const name of ['sdk', ...CLOSURE]) {
      expect(existsSync(join(consumer, 'node_modules', '@brika', name))).toBe(true);
    }
  });

  test('react-free SDK subpaths import without a missing-module error', () => {
    const script = `${REACT_FREE_SUBPATHS.map((s) => `await import(${JSON.stringify(s)});`).join(
      ' '
    )} console.log('IMPORT-OK');`;
    const run = Bun.spawnSync(['bun', '-e', script], {
      cwd: consumer,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = run.stderr.toString();
    expect(stderr).not.toContain('Cannot find module');
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain('IMPORT-OK');
  }, 30_000);
});
