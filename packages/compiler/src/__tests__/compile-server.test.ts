import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileServerEntry, type ServerCompileOptions } from '../compile-server';

describe('compileServerEntry', () => {
  let pluginRoot: string;
  let outdir: string;

  beforeEach(async () => {
    // realpath resolves /var -> /private/var on macOS so paths match in Bun plugins
    pluginRoot = await realpath(await mkdtemp(join(tmpdir(), 'brika-compile-server-')));
    outdir = join(pluginRoot, 'dist');

    await mkdir(join(pluginRoot, 'src'), { recursive: true });
    await writeFile(
      join(pluginRoot, 'src', 'index.ts'),
      "export function hello() { return 'world'; }\n",
    );
    await writeFile(
      join(pluginRoot, 'package.json'),
      JSON.stringify({ name: 'test-plugin' }),
    );
  });

  afterEach(async () => {
    await rm(pluginRoot, { recursive: true, force: true });
  });

  function opts(overrides?: Partial<ServerCompileOptions>): ServerCompileOptions {
    return {
      entrypoint: join(pluginRoot, 'src', 'index.ts'),
      pluginRoot,
      outdir,
      external: [],
      ...overrides,
    };
  }

  // ── 1. Successful compilation ──────────────────────────────────────

  test('successful compilation creates hashed output file', async () => {
    const result = await compileServerEntry(opts());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.cached).toBe(false);
    // Entry path should include source hash: index.<hash>.js
    expect(result.entryPath).toMatch(/index\.[0-9a-f]+\.js$/);

    // Output file should exist
    expect(await Bun.file(result.entryPath).exists()).toBe(true);
  });

  // ── 2. Cache hit ───────────────────────────────────────────────────

  test('second compile with unchanged sources returns cached: true', async () => {
    const first = await compileServerEntry(opts());
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.cached).toBe(false);

    const second = await compileServerEntry(opts());
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.cached).toBe(true);
    expect(second.entryPath).toBe(first.entryPath);
  });

  // ── 3. Cache miss on source change ─────────────────────────────────

  test('cache miss when source changes returns cached: false with new path', async () => {
    const first = await compileServerEntry(opts());
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.cached).toBe(false);

    // Modify the source file
    await writeFile(
      join(pluginRoot, 'src', 'index.ts'),
      "export function hello() { return 'changed'; }\n",
    );

    const second = await compileServerEntry(opts());
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.cached).toBe(false);
    // Hash changed → different entry path
    expect(second.entryPath).not.toBe(first.entryPath);
  });

  // ── 4. Build failure ───────────────────────────────────────────────

  test('build failure throws when entrypoint has unresolvable imports', async () => {
    // Bun.build throws on unresolvable imports in the current Bun version.
    // compileServerEntry propagates this error to the caller.
    await writeFile(
      join(pluginRoot, 'src', 'index.ts'),
      "import { missing } from './does-not-exist';\nexport { missing };\n",
    );

    await expect(compileServerEntry(opts())).rejects.toThrow();
  });

  // ── 5. Clean old outputs ──────────────────────────────────────────

  test('cleans old build outputs before rebuilding', async () => {
    // First build creates output
    const first = await compileServerEntry(opts());
    expect(first.success).toBe(true);
    if (!first.success) return;

    // Create a stale file in the output directory
    const staleFile = join(outdir, 'stale.js');
    await writeFile(staleFile, 'old content');
    expect(await Bun.file(staleFile).exists()).toBe(true);

    // Modify source to trigger a fresh build (not cache hit)
    await writeFile(
      join(pluginRoot, 'src', 'index.ts'),
      "export function hello() { return 'rebuilt'; }\n",
    );

    const second = await compileServerEntry(opts());
    expect(second.success).toBe(true);
    if (!second.success) return;

    // Stale file should be cleaned up
    expect(await Bun.file(staleFile).exists()).toBe(false);
  });

  // ── 6. Custom splitting option ─────────────────────────────────────

  test('splitting: false is respected and build still succeeds', async () => {
    const result = await compileServerEntry(opts({ splitting: false }));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.cached).toBe(false);
    expect(await Bun.file(result.entryPath).exists()).toBe(true);
  });
});
