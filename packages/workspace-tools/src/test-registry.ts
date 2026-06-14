/**
 * Shared harness for "does the PUBLISHED package install and run" e2e tests.
 *
 * Reproduces the real npm publish -> install path without a network registry or
 * any dependency: pack a workspace package in its exact publish form (reusing
 * the ./publish-manifest transforms so the test can't drift from the real
 * publish) and serve it from a throwaway, native-Bun npm registry (the npm GET
 * protocol: packument + tarball with sha512 integrity). A fixture then installs
 * the package by version, exactly as a public consumer would.
 *
 * Used by packages/sdk and packages/create-brika to prove their published,
 * self-contained bins work when installed from a registry.
 */

import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { bundleExports, stripDevManifestFields, stripInternalExports } from './publish-manifest';

export interface RunResult {
  code: number;
  output: string;
}

/** Spawn a command, capture combined output, and return { code, output }. */
export async function run(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>
): Promise<RunResult> {
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

/**
 * Pack a workspace package in its npm publish form into `dest`. Applies the same
 * manifest transforms as the release CLI (strip `./internal/*` exports,
 * repoint exports src -> dist for bundle packages, drop the dev-only `knip`
 * key), then `bun pm pack`, then restores the on-disk manifest.
 */
export async function packPublishForm(
  pkgDir: string,
  dest: string
): Promise<{ tarball: string; manifest: Record<string, unknown> }> {
  const manifestPath = join(pkgDir, 'package.json');
  const original = await Bun.file(manifestPath).text();
  let publishText = stripInternalExports(original) ?? original;
  publishText = bundleExports(publishText) ?? publishText;
  publishText = stripDevManifestFields(publishText) ?? publishText;
  try {
    await Bun.write(manifestPath, publishText);
    const before = new Set(await readdir(dest));
    const result = await run(['bun', 'pm', 'pack', '--destination', dest], pkgDir);
    if (result.code !== 0) {
      throw new Error(`pack failed for ${pkgDir}:\n${result.output}`);
    }
    const produced = (await readdir(dest)).find((f) => f.endsWith('.tgz') && !before.has(f));
    if (!produced) {
      throw new Error(`no .tgz produced by pack for ${pkgDir}`);
    }
    return { tarball: join(dest, produced), manifest: JSON.parse(publishText) };
  } finally {
    await Bun.write(manifestPath, original);
  }
}

export interface MockRegistry {
  url: string;
  stop: () => Promise<void>;
}

/**
 * A throwaway npm registry serving exactly one package: GET the packument and
 * GET the tarball, the minimal protocol `bun install` needs. Works for scoped
 * (`@scope/name`) and unscoped names alike; anything else 404s, so the fixture
 * must scope only this package's name here.
 */
export function startMockRegistry(opts: {
  name: string;
  version: string;
  manifest: Record<string, unknown>;
  tarballFile: string;
  bytes: Uint8Array;
}): MockRegistry {
  const { name, version, manifest, tarballFile, bytes } = opts;
  const tarballRoute = `/${name}/-/${basename(tarballFile)}`;
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const shasum = createHash('sha1').update(bytes).digest('hex');
  let baseUrl = '';
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = decodeURIComponent(new URL(req.url).pathname);
      if (path === `/${name}`) {
        const dist = { tarball: `${baseUrl}${tarballRoute}`, integrity, shasum };
        return Response.json({
          name,
          'dist-tags': { latest: version },
          versions: { [version]: { ...manifest, dist } },
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
  return { url: `${baseUrl}/`, stop: () => server.stop(true) };
}
