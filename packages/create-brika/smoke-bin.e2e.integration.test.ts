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
 * Registry e2e for the published create-brika scaffolder.
 *
 * Builds create-brika (its bin bundles @brika/cli + picocolors into
 * dist/index.js so the published package has no runtime deps), serves it in
 * publish form from a throwaway registry (see scripts/test-registry.ts), then
 * `bun install create-brika@<version>` FROM that registry into a consumer
 * project and runs the installed bin.
 *
 * `create-brika --help` imports @brika/cli at module load, so an exit-0 here
 * proves the published bin is self-contained: if @brika/cli (a devDependency,
 * meant to be inlined) were NOT bundled, the install closure would lack it and
 * the bin would crash with `Cannot find module '@brika/cli'`. That is exactly
 * the regression this guards.
 *
 * The scaffolder is interactive (a required `features` multiselect, no flag), so
 * a full "scaffold a plugin and build it" e2e would need a non-interactive mode
 * on create-brika first; `--help` is the self-contained-bin guarantee available
 * today. Gated behind BRIKA_BIN_SMOKE=1; run with `bun run smoke:bin`.
 */

const cbDir = import.meta.dir;
const cbVersion: string = JSON.parse(await Bun.file(join(cbDir, 'package.json')).text()).version;

describe.skipIf(process.env.BRIKA_BIN_SMOKE !== '1')(
  'published create-brika installs from a registry with a self-contained bin',
  () => {
    let work: string;
    let consumerDir: string;
    let registry: MockRegistry | undefined;

    beforeAll(async () => {
      const build = await run(['bun', 'run', 'build'], cbDir);
      if (build.code !== 0) {
        throw new Error(`create-brika build failed:\n${build.output}`);
      }

      work = await mkdtemp(join(tmpdir(), 'create-brika-smoke-'));
      const tarDir = join(work, 'tarballs');
      await mkdir(tarDir, { recursive: true });

      const { tarball, manifest } = await packPublishForm(cbDir, tarDir);
      registry = startMockRegistry({
        name: 'create-brika',
        version: cbVersion,
        manifest,
        tarballFile: tarball,
        bytes: await Bun.file(tarball).bytes(),
      });

      // create-brika has no runtime dependencies, so the whole install resolves
      // from the mock registry: the consumer fetches create-brika and nothing
      // else, which is the published single-artifact closure under test.
      consumerDir = join(work, 'consumer');
      await mkdir(consumerDir, { recursive: true });
      await writeFile(join(consumerDir, '.npmrc'), `registry=${registry.url}\n`);
      await writeFile(
        join(consumerDir, 'package.json'),
        `${JSON.stringify(
          {
            name: 'create-brika-smoke-consumer',
            version: '1.0.0',
            private: true,
            type: 'module',
            dependencies: { 'create-brika': `^${cbVersion}` },
          },
          null,
          2
        )}\n`
      );

      // Isolate the install cache so a prior run can't mask a resolution bug.
      const install = await run(['bun', 'install'], consumerDir, {
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

    test('the installed create-brika bin runs self-contained (bundled @brika/cli)', async () => {
      const r = await run(['bun', 'node_modules/.bin/create-brika', '--help'], consumerDir);
      if (r.code !== 0) {
        throw new Error(`create-brika --help failed (bin not self-contained?):\n${r.output}`);
      }
      expect(r.output).toContain('create-brika');
      expect(r.code).toBe(0);
    }, 60_000);
  }
);
