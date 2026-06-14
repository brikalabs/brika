import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bundleExports,
  stripDevManifestFields,
  stripInternalExports,
} from '../../scripts/release-libs';

/**
 * Registry e2e for the published @brika/sdk.
 *
 * Reproduces the real npm publish -> install path: build the publish artifacts
 * (the dist bundle with the private closure inlined + the `brika` bin), pack the
 * manifest in its publish form (reusing scripts/release-libs.ts so the test
 * can't drift from the real publish), serve it from a throwaway npm registry,
 * then `bun install @brika/sdk@<version>` FROM that registry into a plugin that
 * depends on @brika/sdk alone, and drive the bundled bin.
 *
 * The registry is a ~30-line native Bun.serve implementing the npm GET protocol
 * (packument + tarball with sha512 integrity): zero dependencies, instant start.
 * Only the `@brika` scope points at it, so `zod` resolves from the default
 * registry exactly as a public consumer's install would. This exercises real
 * tarball fetch/extract, integrity verification, and version-range resolution
 * (which a `file:` link skips): if the bundle leaked a private @brika/* import,
 * `files` dropped dist/pkg or dist/bin, or the bin were not self-contained, the
 * install or `brika build` here fails.
 *
 * Heavy (real install), so it is gated behind BRIKA_BIN_SMOKE=1 and skipped by a
 * normal `bun test`. Run it with `bun run smoke:bin` (also wired into CI). The
 * registry and tmp dir are torn down in `afterAll`.
 */

const sdkDir = import.meta.dir;
const manifestPath = join(sdkDir, 'package.json');
const sdkVersion: string = JSON.parse(await Bun.file(manifestPath).text()).version;

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

/** Pack @brika/sdk in publish form into `dest`; return the tarball path + the published manifest. */
async function packPublishForm(
  dest: string
): Promise<{ tarball: string; manifest: Record<string, unknown> }> {
  const original = await Bun.file(manifestPath).text();
  let publishText = stripInternalExports(original) ?? original;
  publishText = bundleExports(publishText) ?? publishText;
  publishText = stripDevManifestFields(publishText) ?? publishText;
  try {
    await Bun.write(manifestPath, publishText);
    const before = new Set(await readdir(dest));
    const result = await run(['bun', 'pm', 'pack', '--destination', dest], sdkDir);
    if (result.code !== 0) {
      throw new Error(`pack failed:\n${result.output}`);
    }
    const produced = (await readdir(dest)).find((f) => f.endsWith('.tgz') && !before.has(f));
    if (!produced) {
      throw new Error('no .tgz produced by pack');
    }
    return { tarball: join(dest, produced), manifest: JSON.parse(publishText) };
  } finally {
    await Bun.write(manifestPath, original);
  }
}

/**
 * A throwaway npm registry serving exactly one package: GET the packument and
 * GET the tarball, the minimal protocol `bun install` needs. Anything off the
 * @brika scope is never requested (the fixture scopes only @brika here).
 */
function startRegistry(
  manifest: Record<string, unknown>,
  tarballFile: string,
  bytes: Uint8Array
): { url: string; stop: () => Promise<void> } {
  const tarballRoute = `/@brika/sdk/-/sdk-${sdkVersion}.tgz`;
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const shasum = createHash('sha1').update(bytes).digest('hex');
  let baseUrl = '';
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = decodeURIComponent(new URL(req.url).pathname);
      if (path === '/@brika/sdk') {
        const dist = { tarball: `${baseUrl}${tarballRoute}`, integrity, shasum };
        return Response.json({
          name: '@brika/sdk',
          'dist-tags': { latest: sdkVersion },
          versions: { [sdkVersion]: { ...manifest, dist } },
        });
      }
      if (path === tarballRoute) {
        return new Response(Bun.file(tarballFile), {
          headers: { 'content-type': 'application/octet-stream' },
        });
      }
      return new Response('not found', { status: 404 });
    },
  });
  baseUrl = `http://localhost:${server.port}`;
  return {
    url: `${baseUrl}/`,
    stop: () => server.stop(true),
  };
}

describe.skipIf(process.env.BRIKA_BIN_SMOKE !== '1')(
  'published @brika/sdk installs from a registry with a working, self-contained brika bin',
  () => {
    let work: string;
    let pluginDir: string;
    let registry: { url: string; stop: () => Promise<void> } | undefined;

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

      // Pack ONLY @brika/sdk in publish form and serve it from a throwaway
      // registry; the closure is inlined, so a plugin installs @brika/sdk alone.
      const { tarball, manifest } = await packPublishForm(tarDir);
      registry = startRegistry(manifest, tarball, await Bun.file(tarball).bytes());

      // A throwaway fixture plugin that depends on ONLY @brika/sdk, by version,
      // resolved from the registry exactly as a published install would.
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
