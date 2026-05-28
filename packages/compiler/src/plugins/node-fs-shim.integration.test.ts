/**
 * Integration test for the compile-time `node:fs/promises` substitution.
 *
 * Builds a tiny entrypoint that imports the real `node:fs/promises`,
 * asserts the bundle no longer carries the literal `fs/promises`
 * import, then runs the bundle in a subprocess with a stubbed
 * `globalThis.__brika_fs` to verify the shim's API surface.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNodeFsShimPath, nodeFsShimPlugin } from './node-fs-shim';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'brika-fs-shim-'));
  tempDirs.push(dir);
  return dir;
}

describe('nodeFsShimPlugin', () => {
  test('exposes the resolved shim path', () => {
    expect(getNodeFsShimPath()).toMatch(/node-fs-promises-shim\.ts$/);
  });

  test('rewrites `from "node:fs/promises"` to point at the shim', async () => {
    const dir = makeTempDir();
    const entry = join(dir, 'entry.ts');
    writeFileSync(
      entry,
      `import { readFile } from 'node:fs/promises';
       export const r = readFile;
      `
    );
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: dir,
      target: 'bun',
      format: 'esm',
      plugins: [nodeFsShimPlugin()],
    });
    expect(result.success).toBe(true);
    const out = await Bun.file(join(dir, 'entry.js')).text();
    expect(out).not.toMatch(/from\s+["'](?:node:)?fs\/promises["']/);
  });

  test('rewrites the bare `fs/promises` form too', async () => {
    const dir = makeTempDir();
    const entry = join(dir, 'entry.ts');
    writeFileSync(
      entry,
      `import { writeFile } from 'fs/promises';
       export const w = writeFile;
      `
    );
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: dir,
      target: 'bun',
      format: 'esm',
      plugins: [nodeFsShimPlugin()],
    });
    expect(result.success).toBe(true);
    const out = await Bun.file(join(dir, 'entry.js')).text();
    expect(out).not.toMatch(/from\s+["'](?:node:)?fs\/promises["']/);
  });

  test('a built bundle invoked with a stub runtime returns the shimmed data', async () => {
    const dir = makeTempDir();
    const entry = join(dir, 'entry.ts');
    writeFileSync(
      entry,
      `import { readFile, exists } from 'node:fs/promises';
       globalThis.__brika_fs = {
         readFile: async () => ({ encoding: 'utf-8', content: 'hello-from-shim' }),
         writeFile: async () => ({ bytesWritten: 0 }),
         readdir: async () => ({ entries: [] }),
         stat: async () => ({ size: 0, mtimeMs: 0, isFile: true, isDirectory: false, isSymlink: false }),
         mkdir: async () => ({ created: false }),
         rm: async () => ({ removed: false }),
         exists: async () => ({ exists: true }),
       };
       const content = await readFile('/data/x.txt', 'utf-8');
       const present = await exists('/data/x.txt');
       console.log(JSON.stringify({ content, present }));
      `
    );
    const built = await Bun.build({
      entrypoints: [entry],
      outdir: dir,
      target: 'bun',
      format: 'esm',
      plugins: [nodeFsShimPlugin()],
    });
    expect(built.success).toBe(true);
    const proc = Bun.spawn(['bun', join(dir, 'entry.js')], { stdout: 'pipe' });
    await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(JSON.parse(stdout.trim())).toEqual({
      content: 'hello-from-shim',
      present: true,
    });
  });
});
