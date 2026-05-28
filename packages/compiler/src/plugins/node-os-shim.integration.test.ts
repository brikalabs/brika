/**
 * Integration test for the build-time `node:os` substitution.
 *
 * We build a tiny entrypoint that imports the real `node:os` and asserts
 * the bundle uses our shim instead. The bundled output is then run in a
 * subprocess to verify the runtime behaviour matches the shim contract.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNodeOsShimPath, nodeOsShimPlugin } from './node-os-shim';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup races — the test already passed/failed.
      }
    }
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'brika-os-shim-'));
  tempDirs.push(dir);
  return dir;
}

describe('nodeOsShimPlugin', () => {
  test('exposes the resolved shim path', () => {
    const path = getNodeOsShimPath();
    expect(path).toMatch(/node-os-shim\.ts$/);
  });

  test('redirects node:os imports during Bun.build', async () => {
    const dir = makeTempDir();
    const entry = join(dir, 'entry.ts');
    writeFileSync(
      entry,
      `import { hostname, platform, cpus } from 'node:os';
       console.log(JSON.stringify({ hostname: hostname(), platform: platform(), cpuCount: cpus().length }));
      `
    );

    const result = await Bun.build({
      entrypoints: [entry],
      outdir: dir,
      target: 'bun',
      format: 'esm',
      // The real `node:os` would also work here — we explicitly DON'T
      // mark it external so the bundler resolves it; the plugin then
      // redirects to our shim.
      plugins: [nodeOsShimPlugin()],
    });

    expect(result.success).toBe(true);

    // The bundled output should NOT carry a `from "node:os"` import
    // anywhere — the shim's code is inlined.
    const out = await Bun.file(join(dir, 'entry.js')).text();
    expect(out).not.toMatch(/from\s+["']node:os["']/);
    // But the sanitised hostname constant should appear (inlined).
    expect(out).toContain('brika-plugin');
  });

  test('the built bundle runs and uses sanitised values', async () => {
    const dir = makeTempDir();
    const entry = join(dir, 'entry.ts');
    writeFileSync(
      entry,
      `import { hostname, userInfo, networkInterfaces } from 'node:os';
       console.log(JSON.stringify({
         hostname: hostname(),
         username: userInfo().username,
         interfaces: networkInterfaces(),
       }));
      `
    );

    const build = await Bun.build({
      entrypoints: [entry],
      outdir: dir,
      target: 'bun',
      format: 'esm',
      plugins: [nodeOsShimPlugin()],
    });
    expect(build.success).toBe(true);

    const outPath = join(dir, 'entry.js');
    const proc = Bun.spawn(['bun', outPath], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toEqual({
      hostname: 'brika-plugin',
      username: 'brika-plugin',
      interfaces: {},
    });
  });
});
