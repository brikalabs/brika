import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type MockRegistry,
  packPublishForm,
  run,
  startMockRegistry,
} from '@brika/workspace-tools/src/test-registry';

/**
 * Registry e2e for the published @brika/sdk.
 *
 * Builds the publish artifacts (the dist bundle with the private closure inlined
 * + the `brika` bin), serves @brika/sdk in its real publish form from a
 * throwaway registry (see scripts/test-registry.ts), then
 * `bun install @brika/sdk@<version>` FROM that registry into a plugin that
 * depends on @brika/sdk alone, and drives the bundled bin.
 *
 * Installing from a registry (not a `file:` link) exercises tarball
 * fetch/extract, integrity verification, and version-range resolution as a real
 * consumer hits them: if the bundle leaked a private @brika/* import, `files`
 * dropped dist/pkg or dist/bin, or the bin were not self-contained, the install
 * or `brika build` here fails.
 *
 * Heavy (real install), so it is gated behind BRIKA_BIN_SMOKE=1 and skipped by a
 * normal `bun test`. Run it with `bun run smoke:bin` (also wired into CI).
 */

const sdkDir = import.meta.dir;
const sdkVersion: string = JSON.parse(await Bun.file(join(sdkDir, 'package.json')).text()).version;

describe.skipIf(process.env.BRIKA_BIN_SMOKE !== '1')(
  'published @brika/sdk installs from a registry with a working, self-contained brika bin',
  () => {
    let work: string;
    let pluginDir: string;
    let registry: MockRegistry | undefined;

    beforeAll(async () => {
      const dist = await run(['bun', 'run', 'build:dist'], sdkDir);
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

      // Pack ONLY @brika/sdk in publish form and serve it; the closure is
      // inlined, so a plugin installs @brika/sdk alone.
      const { tarball, manifest } = await packPublishForm(sdkDir, tarDir);
      registry = startMockRegistry({
        name: '@brika/sdk',
        version: sdkVersion,
        manifest,
        tarballFile: tarball,
        bytes: await Bun.file(tarball).bytes(),
      });

      // A fixture plugin that depends on ONLY @brika/sdk, by version, resolved
      // from the registry exactly as a published install would. Scoping only
      // @brika here keeps zod resolving from the default registry.
      pluginDir = join(work, 'plugin');
      await mkdir(join(pluginDir, 'src'), { recursive: true });
      await writeFile(join(pluginDir, 'src', 'index.ts'), 'export {};\n');
      await writeFile(join(pluginDir, 'icon.svg'), '<svg></svg>\n');
      await writeFile(join(pluginDir, '.npmrc'), `@brika:registry=${registry.url}\n`);
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
            dependencies: { '@brika/sdk': `^${sdkVersion}` },
          },
          null,
          2
        )}\n`
      );

      // Isolate the install cache so a prior run can't mask a resolution bug.
      const install = await run(['bun', 'install'], pluginDir, {
        BUN_INSTALL_CACHE_DIR: join(work, 'bun-cache'),
      });
      if (install.code !== 0) {
        throw new Error(`install from registry failed:\n${install.output}`);
      }
    }, 300_000);

    afterAll(async () => {
      await registry?.stop();
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
