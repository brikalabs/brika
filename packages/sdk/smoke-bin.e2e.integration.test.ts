import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bundleExports,
  stripDevManifestFields,
  stripInternalExports,
} from '../../scripts/release-libs';

/**
 * Packed-tarball e2e for the published @brika/sdk.
 *
 * Reproduces the exact npm publish artifact (build the dist bundle with the
 * private closure inlined + the `brika` bin, apply the publish manifest
 * transform reusing scripts/release-libs.ts so the test can't drift from the
 * real publish), packs JUST @brika/sdk, installs it into a throwaway fixture
 * plugin that depends on @brika/sdk alone, and drives the bundled `brika` bin.
 * If the bundle leaked a private @brika/* import, `files` failed to ship
 * dist/pkg or dist/bin, or the bin were not self-contained, the install or the
 * `brika build` here fails: exactly the regressions this guards.
 *
 * Heavy (real `bun install` over the network), so it is gated behind
 * BRIKA_BIN_SMOKE=1 and skipped by a normal `bun test`. Run it with
 * `bun run smoke:bin` (also wired into CI). The fixture lives in a tmp dir that
 * `afterAll` disposes; no manual cleanup threads through the test body.
 */

const sdkDir = import.meta.dir;
const manifestPath = join(sdkDir, 'package.json');

/** Spawn a command, capture combined output, and return { code, output }. */
async function run(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>
): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, output: `${stdout}${stderr}` };
}

/** Pack a package directory into `dest` and return the produced tarball path. */
async function pack(dir: string, dest: string): Promise<string> {
  const before = new Set(await readdir(dest));
  const result = await run(['bun', 'pm', 'pack', '--destination', dest], dir);
  if (result.code !== 0) {
    throw new Error(`pack failed for ${dir}:\n${result.output}`);
  }
  const produced = (await readdir(dest)).find((f) => f.endsWith('.tgz') && !before.has(f));
  if (!produced) {
    throw new Error(`no .tgz produced by pack for ${dir}`);
  }
  return join(dest, produced);
}

/** Rewrite @brika/sdk to its publish form, pack it, and restore the manifest. */
async function packPublishForm(dest: string): Promise<string> {
  const original = await Bun.file(manifestPath).text();
  let publishText = stripInternalExports(original) ?? original;
  publishText = bundleExports(publishText) ?? publishText;
  publishText = stripDevManifestFields(publishText) ?? publishText;
  try {
    await Bun.write(manifestPath, publishText);
    return await pack(sdkDir, dest);
  } finally {
    await Bun.write(manifestPath, original);
  }
}

describe.skipIf(process.env.BRIKA_BIN_SMOKE !== '1')(
  'packed @brika/sdk ships a working, self-contained brika bin',
  () => {
    let work: string;
    let pluginDir: string;

    beforeAll(async () => {
      // Build the publish artifacts: the dist bundle (private closure inlined)
      // and the self-contained `brika` bin.
      const dist = await run(['bun', 'run', 'build:dist'], sdkDir, {
        NODE_OPTIONS: '--max-old-space-size=8192',
      });
      if (dist.code !== 0) {
        throw new Error(`build:dist failed:\n${dist.output}`);
      }
      const bin = await run(['bun', 'run', 'build:bin'], sdkDir);
      if (bin.code !== 0) {
        throw new Error(`build:bin failed:\n${bin.output}`);
      }

      work = await mkdtemp(join(tmpdir(), 'brika-bin-smoke-'));
      const tarDir = join(work, 'tarballs');
      await mkdir(tarDir, { recursive: true });

      // Pack ONLY @brika/sdk in publish form: the closure is inlined into the
      // bundle, so a plugin installs @brika/sdk alone (no closure tarballs).
      const sdkTarball = await packPublishForm(tarDir);
      const sdkVersion: string = JSON.parse(await Bun.file(manifestPath).text()).version;

      // A throwaway fixture plugin that depends on ONLY @brika/sdk, exactly what
      // a published install looks like.
      pluginDir = join(work, 'plugin');
      await mkdir(join(pluginDir, 'src'), { recursive: true });
      await writeFile(join(pluginDir, 'src', 'index.ts'), 'export {};\n');
      await writeFile(join(pluginDir, 'icon.svg'), '<svg></svg>\n');
      await writeFile(
        join(pluginDir, 'package.json'),
        `${JSON.stringify(
          {
            name: 'brika-plugin-smoke',
            version: '1.0.0',
            type: 'module',
            main: './src/index.ts',
            engines: { brika: `^${sdkVersion}` },
            $schema: 'https://schema.brika.dev/plugin.schema.json',
            keywords: ['brika', 'brika-plugin'],
            icon: './icon.svg',
            files: ['src', 'icon.svg'],
            dependencies: { '@brika/sdk': `file:${sdkTarball}` },
          },
          null,
          2
        )}\n`
      );

      const install = await run(['bun', 'install'], pluginDir);
      if (install.code !== 0) {
        throw new Error(`install failed:\n${install.output}`);
      }
    }, 300_000);

    afterAll(async () => {
      if (work) {
        await rm(work, { recursive: true, force: true });
      }
    });

    test('brika build --check exercises the bundled compiler', async () => {
      const r = await run(['bun', 'node_modules/.bin/brika', 'build', '--check'], pluginDir);
      if (r.code !== 0) {
        throw new Error(`brika build --check failed (bin not self-contained?):\n${r.output}`);
      }
      expect(r.code).toBe(0);
    }, 60_000);

    test('brika verify passes', async () => {
      const r = await run(['bun', 'node_modules/.bin/brika', 'verify'], pluginDir);
      expect(r.output).toContain('Verification passed');
      expect(r.code).toBe(0);
    }, 60_000);

    test('brika install falls back cleanly when no hub is reachable', async () => {
      // Point at an unused port so the bundled loopback client finds no hub and
      // must fall back with the clear message, not crash on a missing dependency.
      const r = await run(['bun', 'node_modules/.bin/brika', 'install', '.'], pluginDir, {
        BRIKA_HOST: '127.0.0.1',
        BRIKA_PORT: '59999',
      });
      expect(r.output).toContain('needs a running Brika hub');
      expect(r.code).toBe(1);
    }, 60_000);
  }
);
