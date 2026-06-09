/**
 * Tests for ModuleCompiler class
 *
 * Tests compile(), get(), remove() and the internal pipeline:
 * - entrypoint existence check
 * - hash-based cache validation
 * - Bun.build integration
 * - CSS compilation via TailwindCompiler
 * - Error handling for missing files, build failures, CSS failures
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { get, stub, useTestBed } from '@brika/di/testing';
import { Logger } from '@/runtime/logs/log-router';
import { ModuleCompiler, reachableChunks } from '@/runtime/modules/module-compiler';
import { chunkScopeId, isChunkId } from '@/runtime/modules/module-kinds';

// ─────────────────────────────────────────────────────────────────────────────
// Temp directory
// ─────────────────────────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `brika-test-mc-compile-${Date.now()}`);

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Entry name (no extension) Bun would emit for an entrypoint path. */
function entryName(entrypoint: string): string {
  return basename(entrypoint).replace(/\.[tj]sx?$/, '');
}

/**
 * Mock a successful `Bun.build` for the per-kind bundle. Produces one
 * `entry-point` output per entrypoint (named `./<name>.js` so the compiler maps
 * it back to its source) plus any shared `chunk` outputs. `js` may be a string
 * or a per-entrypoint function.
 */
function makeBundleSuccess(
  opts: { entrypoints: string[] },
  js: string | ((entrypoint: string) => string),
  chunks: { name: string; js: string }[] = []
) {
  const entryOutputs = opts.entrypoints.map((e) => ({
    path: `./${entryName(e)}.js`,
    kind: 'entry-point',
    text: () => Promise.resolve(typeof js === 'function' ? js(e) : js),
  }));
  const chunkOutputs = chunks.map((c) => ({
    path: `./${c.name}.js`,
    kind: 'chunk',
    text: () => Promise.resolve(c.js),
  }));
  return {
    success: true,
    outputs: [...entryOutputs, ...chunkOutputs],
    logs: [],
  } as unknown as Awaited<ReturnType<typeof Bun.build>>;
}

/** A `Bun.build` mock implementation that bundles every entrypoint with `js`. */
function bundleImpl(
  js: string | ((entrypoint: string) => string),
  chunks: { name: string; js: string }[] = []
) {
  return ((opts: { entrypoints: string[] }) =>
    Promise.resolve(makeBundleSuccess(opts, js, chunks))) as typeof Bun.build;
}

function makeBuildFailure(messages: string[]) {
  return {
    success: false,
    outputs: [],
    logs: messages.map((m) => ({
      message: m,
    })),
  } as unknown as Awaited<ReturnType<typeof Bun.build>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// reachableChunks (CSS scan closure over the chunk graph)
// ─────────────────────────────────────────────────────────────────────────────

describe('reachableChunks', () => {
  const chunk = (name: string, imports: string[] = []) => ({
    name,
    js: `${imports.map((i) => `import"./${i}.js";`).join('')}/* ${name} */`,
  });

  test('follows transitive chunk->chunk edges, skipping unreferenced chunks', () => {
    const a = chunk('_brika_chunk_a', ['_brika_chunk_b']);
    const b = chunk('_brika_chunk_b');
    const c = chunk('_brika_chunk_c'); // never referenced
    const entry = 'import"./_brika_chunk_a.js";';

    const names = reachableChunks(entry, [a, b, c])
      .map((x) => x.name)
      .sort();
    expect(names).toEqual(['_brika_chunk_a', '_brika_chunk_b']);
  });

  test('terminates on a cycle without duplicating chunks', () => {
    const a = chunk('_brika_chunk_a', ['_brika_chunk_b']);
    const b = chunk('_brika_chunk_b', ['_brika_chunk_a']);
    const entry = 'import"./_brika_chunk_a.js";';

    const names = reachableChunks(entry, [a, b]).map((x) => x.name);
    expect(names.sort()).toEqual(['_brika_chunk_a', '_brika_chunk_b']);
    expect(new Set(names).size).toBe(names.length);
  });

  test('returns nothing when the entry imports no chunks', () => {
    expect(reachableChunks('export default 1;', [chunk('_brika_chunk_a')])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// get() — returns JS cache entry
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCompiler - get()', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    compiler = get(ModuleCompiler);
  });

  test('returns undefined for unknown key', () => {
    expect(compiler.get('nonexistent:module')).toBeUndefined();
  });

  test('returns undefined for partially matching key', () => {
    expect(compiler.get('plugin:')).toBeUndefined();
    expect(compiler.get(':module')).toBeUndefined();
  });

  test('returns undefined for empty string', () => {
    expect(compiler.get('')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// remove() — evicts plugin entries from cache
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCompiler - remove()', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    compiler = get(ModuleCompiler);
  });

  test('does not throw when removing unknown plugin', () => {
    expect(() => compiler.remove('nonexistent-plugin')).not.toThrow();
  });

  test('does not throw when removing scoped plugin name', () => {
    expect(() => compiler.remove('@brika/weather')).not.toThrow();
  });

  test('does not throw when called multiple times', () => {
    expect(() => {
      compiler.remove('plugin-a');
      compiler.remove('plugin-a');
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compile() — full pipeline (each test manages its own spies)
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCompiler - compile()', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    compiler = get(ModuleCompiler);
  });

  // ── entrypoint not found ─────────────────────────────────────────────────

  test('skips module when entrypoint does not exist', async () => {
    // Real dir with src/ but no page file — entrypoint missing
    const root = join(TEST_DIR, 'no-entry');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'dummy.ts'), 'export {}');

    const buildSpy = spyOn(Bun, 'build').mockImplementation(bundleImpl(''));

    try {
      await compiler.compile('my-plugin', root, {
        pages: [{ id: 'settings' }],
      });
      expect(buildSpy).not.toHaveBeenCalled();
    } finally {
      buildSpy.mockRestore();
    }
  });

  test('handles multiple modules where some do not exist', async () => {
    const root = join(TEST_DIR, 'multi-exist');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'pages', 'existing.tsx'), 'const x = 1;');
    // 'missing' page intentionally not created

    const buildSpy = spyOn(Bun, 'build').mockImplementation(bundleImpl('export default 1;'));

    try {
      await compiler.compile('my-plugin', root, {
        pages: [{ id: 'existing' }, { id: 'missing' }],
      });
      // Build is called once for the kind, with only the existing entrypoint.
      expect(buildSpy).toHaveBeenCalledTimes(1);
      expect((buildSpy.mock.calls[0][0] as { entrypoints: string[] }).entrypoints).toHaveLength(1);
    } finally {
      buildSpy.mockRestore();
    }
  });

  // ── successful build ─────────────────────────────────────────────────────

  test('compiles module and populates cache on successful build', async () => {
    const root = join(TEST_DIR, 'project');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(
      join(root, 'src', 'pages', 'home.tsx'),
      'export default () => <div>Home</div>;'
    );

    const compiledJs = 'var e=()=>"Home";export default e;';
    const buildSpy = spyOn(Bun, 'build').mockImplementation(bundleImpl(compiledJs));

    try {
      await compiler.compile('test-plugin', root, {
        pages: [{ id: 'home' }],
      });

      const jsEntry = compiler.get('test-plugin:pages/home');
      expect(jsEntry).toBeDefined();
      expect(jsEntry?.hash).toMatch(/^[0-9a-z]+$/);
      expect(jsEntry?.filePath).toBeDefined();
      expect(await Bun.file(jsEntry?.filePath ?? '').text()).toBe(compiledJs);
    } finally {
      buildSpy.mockRestore();
    }
  });

  test('bundles all modules of a kind in a single build', async () => {
    const root = join(TEST_DIR, 'proj-multi');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'pages', 'page1.tsx'), 'export const P1 = 1;');
    await Bun.write(join(root, 'src', 'pages', 'page2.tsx'), 'export const P2 = 2;');

    const buildSpy = spyOn(Bun, 'build').mockImplementation(
      bundleImpl((e) => (e.includes('page1') ? 'module_1' : 'module_2'))
    );

    try {
      await compiler.compile('multi', root, {
        pages: [{ id: 'page1' }, { id: 'page2' }],
      });
      // One build for the whole `page` kind, with both entrypoints.
      expect(buildSpy).toHaveBeenCalledTimes(1);
      expect((buildSpy.mock.calls[0][0] as { entrypoints: string[] }).entrypoints).toHaveLength(2);
      expect(await Bun.file(compiler.get('multi:pages/page1')?.filePath ?? '').text()).toBe(
        'module_1'
      );
      expect(await Bun.file(compiler.get('multi:pages/page2')?.filePath ?? '').text()).toBe(
        'module_2'
      );
    } finally {
      buildSpy.mockRestore();
    }
  });

  // ── build with auto-detected action files ─────────────────────────────────

  test('includes actions plugin when action files are auto-detected', async () => {
    // Use real temp dir because Bun.Glob.scan() needs real files on disk
    const projDir = join(TEST_DIR, 'proj-actions');
    const srcDir = join(projDir, 'src');
    await mkdir(join(srcDir, 'pages'), { recursive: true });
    await Bun.write(join(srcDir, 'pages', 'main.tsx'), 'export default () => null;');
    await Bun.write(
      join(srcDir, 'actions.ts'),
      'export const play = defineAction(async () => {});'
    );

    const buildSpy = spyOn(Bun, 'build').mockImplementation(bundleImpl('built;'));

    try {
      await compiler.compile('actions-plugin', projDir, {
        pages: [{ id: 'main' }],
      });

      expect(buildSpy).toHaveBeenCalledTimes(1);
      const buildCall = buildSpy.mock.calls[0][0] as {
        plugins: unknown[];
      };
      // externals + actions + force-side-effects + i18n-call-site = 4 plugins
      expect(buildCall.plugins).toHaveLength(4);
    } finally {
      buildSpy.mockRestore();
    }
  });

  test('uses only externals plugin when no action files are found', async () => {
    // Use real temp dir with no action files
    const projDir = join(TEST_DIR, 'proj-no-actions');
    const srcDir = join(projDir, 'src');
    await mkdir(join(srcDir, 'pages'), { recursive: true });
    await Bun.write(join(srcDir, 'pages', 'main.tsx'), 'export default () => null;');

    const buildSpy = spyOn(Bun, 'build').mockImplementation(bundleImpl('built;'));

    try {
      await compiler.compile('no-actions', projDir, {
        pages: [{ id: 'main' }],
      });

      expect(buildSpy).toHaveBeenCalledTimes(1);
      const buildCall = buildSpy.mock.calls[0][0] as {
        plugins: unknown[];
      };
      // externals + actions + force-side-effects + i18n-call-site = 4 plugins
      expect(buildCall.plugins).toHaveLength(4);
    } finally {
      buildSpy.mockRestore();
    }
  });

  // ── build failure ────────────────────────────────────────────────────────

  test('does not populate cache when build fails', async () => {
    const root = join(TEST_DIR, 'proj-fail');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'pages', 'broken.tsx'), 'invalid syntax {{{}}}');

    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(
      makeBuildFailure(['SyntaxError: unexpected token'])
    );

    try {
      await compiler.compile('fail-plugin', root, {
        pages: [{ id: 'broken' }],
      });
      expect(compiler.get('fail-plugin:pages/broken')).toBeUndefined();
    } finally {
      buildSpy.mockRestore();
    }
  });

  test('one broken module falls back to per-module compile without losing siblings', async () => {
    const root = join(TEST_DIR, 'proj-mixed');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'pages', 'good.tsx'), 'export default 1;');
    await Bun.write(join(root, 'src', 'pages', 'bad.tsx'), 'broken');

    // Any build whose entrypoints include `bad` fails: the kind bundle (both
    // entrypoints) fails, triggering the per-module fallback where `good`
    // compiles on its own and only `bad` fails.
    const buildSpy = spyOn(Bun, 'build').mockImplementation(((opts: { entrypoints: string[] }) => {
      if (opts.entrypoints.some((e) => e.includes('bad'))) {
        return Promise.resolve(makeBuildFailure(['error']));
      }
      return Promise.resolve(makeBundleSuccess(opts, 'good-output'));
    }) as typeof Bun.build);

    try {
      await compiler.compile('mixed', root, {
        pages: [{ id: 'good' }, { id: 'bad' }],
      });

      expect(compiler.get('mixed:pages/good')).toBeDefined();
      expect(await Bun.file(compiler.get('mixed:pages/good')?.filePath ?? '').text()).toBe(
        'good-output'
      );
      expect(compiler.get('mixed:pages/bad')).toBeUndefined();
    } finally {
      buildSpy.mockRestore();
    }
  });

  // ── build options ────────────────────────────────────────────────────────

  test('passes correct build options to Bun.build', async () => {
    const root = join(TEST_DIR, 'proj-opts');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'pages', 'settings.tsx'), 'export default "settings";');

    const buildSpy = spyOn(Bun, 'build').mockImplementation(bundleImpl('out;'));

    try {
      await compiler.compile('opts-plugin', root, {
        pages: [{ id: 'settings' }],
      });

      const buildOpts = buildSpy.mock.calls[0][0] as {
        target: string;
        format: string;
        minify: boolean;
        splitting: boolean;
        entrypoints: string[];
      };
      expect(buildOpts.target).toBe('browser');
      expect(buildOpts.format).toBe('esm');
      expect(buildOpts.minify).toBe(true);
      expect(buildOpts.splitting).toBe(true);
      expect(buildOpts.entrypoints).toEqual([join(root, 'src/pages/settings.tsx')]);
    } finally {
      buildSpy.mockRestore();
    }
  });

  // ── empty modules list ───────────────────────────────────────────────────

  test('handles empty modules list without calling build', async () => {
    const root = join(TEST_DIR, 'proj-empty');
    await mkdir(join(root, 'src'), { recursive: true });
    await Bun.write(join(root, 'src', 'index.ts'), 'export {}');

    const buildSpy = spyOn(Bun, 'build').mockImplementation(bundleImpl(''));

    try {
      await compiler.compile('empty-plugin', root, {});
      expect(buildSpy).not.toHaveBeenCalled();
    } finally {
      buildSpy.mockRestore();
    }
  });

  // ── remove after compile ─────────────────────────────────────────────────

  test('remove() evicts compiled entries from cache', async () => {
    const root = join(TEST_DIR, 'proj-remove');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'pages', 'widget.tsx'), 'export const W = 1;');

    const buildSpy = spyOn(Bun, 'build').mockImplementation(bundleImpl('widget-js;'));

    try {
      await compiler.compile('removable', root, {
        pages: [{ id: 'widget' }],
      });
      expect(compiler.get('removable:pages/widget')).toBeDefined();

      compiler.remove('removable', root);
      expect(compiler.get('removable:pages/widget')).toBeUndefined();
    } finally {
      buildSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compile() — cache hit path (real filesystem)
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCompiler - compile() cache hit', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    compiler = get(ModuleCompiler);
  });

  test('skips build when module is loaded from disk cache', async () => {
    const pluginName = 'cache-hit-plugin';
    const moduleId = 'dashboard';
    const sourceContent = 'export const App = () => <div/>;';

    // Create a fake plugin root with source and cache dirs
    const pluginRoot = join(TEST_DIR, 'root-cache');
    const sourceDir = join(pluginRoot, 'src', 'pages');
    const cacheDir = join(pluginRoot, 'node_modules', '.cache', 'brika', 'pages');
    await mkdir(sourceDir, { recursive: true });
    await mkdir(cacheDir, { recursive: true });
    await Bun.write(join(sourceDir, `${moduleId}.tsx`), sourceContent);

    // Compute the plugin-wide hash (same algo as ModuleCompiler uses)
    const { hashPluginSources } = await import('@brika/compiler');
    const hash = await hashPluginSources(pluginRoot);

    // Prepare the disk cache entry
    await Bun.write(join(cacheDir, `${moduleId}.${hash}.js`), 'cached-js');

    const buildSpy = spyOn(Bun, 'build');

    try {
      await compiler.compile(pluginName, pluginRoot, {
        pages: [{ id: moduleId }],
      });

      // Build should NOT have been called — cache hit
      expect(buildSpy).not.toHaveBeenCalled();

      // The entry should be available via get()
      const jsEntry = compiler.get(`${pluginName}:pages/${moduleId}`);
      expect(jsEntry).toBeDefined();
      expect(jsEntry?.filePath).toBeDefined();
      expect(await Bun.file(jsEntry?.filePath ?? '').text()).toBe('cached-js');
    } finally {
      buildSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compile() shared chunks (real Bun.build, no mock)
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCompiler - shared chunks', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    compiler = get(ModuleCompiler);
  });

  test('extracts a shared dependency into one chunk resolvable per-plugin', async () => {
    const root = join(TEST_DIR, 'chunk-plugin');
    const pagesDir = join(root, 'src', 'pages');
    await mkdir(pagesDir, { recursive: true });
    // A helper big enough that the bundler hoists it into a shared chunk once
    // both pages import it, instead of inlining a copy into each entry.
    await Bun.write(
      join(root, 'src', 'shared.ts'),
      "export const TABLE = Array.from({ length: 40 }, (_, i) => 'row' + i);\n" +
        "export function greet(name: string) { return 'hi ' + name + ' from the shared helper'; }"
    );
    await Bun.write(
      join(pagesDir, 'alpha.tsx'),
      "import { greet, TABLE } from '../shared';\nexport default () => greet('a') + TABLE.length;"
    );
    await Bun.write(
      join(pagesDir, 'beta.tsx'),
      "import { greet, TABLE } from '../shared';\nexport default () => greet('b') + TABLE.join();"
    );

    // spyOn calls through to the real Bun.build; we only count invocations.
    const buildSpy = spyOn(Bun, 'build');
    try {
      await compiler.compile('chunked', root, {
        pages: [{ id: 'alpha' }, { id: 'beta' }],
      });

      const alpha = compiler.get('chunked:pages/alpha');
      const beta = compiler.get('chunked:pages/beta');
      expect(alpha).toBeDefined();
      expect(beta).toBeDefined();

      // Each entry references the shared chunk by a relative import.
      const alphaJs = await Bun.file(alpha?.filePath ?? '').text();
      const match = alphaJs.match(/_brika_chunk_[a-z0-9]+/);
      expect(match).not.toBeNull();
      const chunkId = match?.[0] ?? '';
      expect(isChunkId(chunkId)).toBe(true);

      // The chunk resolves through the per-plugin namespace (kind-independent),
      // and carries the shared helper, not each entry.
      const chunk = compiler.get(chunkScopeId('chunked', chunkId));
      expect(chunk).toBeDefined();
      expect(await Bun.file(chunk?.filePath ?? '').text()).toContain('the shared helper');
      expect(alphaJs).not.toContain('the shared helper');

      // One build for both pages.
      expect(buildSpy).toHaveBeenCalledTimes(1);

      // A second compile is a pure cache hit (no rebuild) that still re-registers
      // the chunk from disk so entry imports keep resolving after a restart.
      await compiler.compile('chunked', root, {
        pages: [{ id: 'alpha' }, { id: 'beta' }],
      });
      expect(buildSpy).toHaveBeenCalledTimes(1);
      expect(compiler.get(chunkScopeId('chunked', chunkId))).toBeDefined();
    } finally {
      buildSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ModuleCache - loadFromDisk (integration via real filesystem)
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCache - loadFromDisk', () => {
  const moduleId = 'page';
  const hash = 'abc12345';
  const jsContent = 'export default 42;';
  const diskDir = join(TEST_DIR, 'load-disk-test');

  beforeAll(async () => {
    await mkdir(diskDir, { recursive: true });
    await Bun.write(join(diskDir, `${moduleId}.${hash}.js`), jsContent);
  });

  test('returns true on cache hit and populates in-memory metadata', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();

    const hit = await cache.loadFromDisk(diskDir, 'test:page', moduleId, hash);
    expect(hit).toBe(true);

    const entry = cache.get('test:page');
    expect(entry).toBeDefined();
    expect(entry?.hash).toMatch(/^[0-9a-z]+$/);
    expect(entry?.filePath).toBe(join(diskDir, `${moduleId}.${hash}.js`));
  });

  test('returns false when hash does not match', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();

    const hit = await cache.loadFromDisk(diskDir, 'test:page', moduleId, 'wronghash');
    expect(hit).toBe(false);
  });

  test('returns false when plugin does not exist', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();

    const hit = await cache.loadFromDisk('/nonexistent', 'test:no', 'no-module', 'deadbeef');
    expect(hit).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ModuleCache - store (writes to disk + stores metadata)
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCache - store', () => {
  test('writes JS file to disk and populates metadata', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();
    const storeDir = join(TEST_DIR, 'store-test');

    await cache.store('test:mod', storeDir, 'mod', 'hash1', 'export const a = 1;');

    const jsFile = Bun.file(join(storeDir, 'mod.hash1.js'));
    expect(await jsFile.exists()).toBe(true);
    expect(await jsFile.text()).toBe('export const a = 1;');

    const entry = cache.get('test:mod');
    expect(entry?.hash).toMatch(/^[0-9a-z]+$/);
    expect(entry?.filePath).toBe(join(storeDir, 'mod.hash1.js'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ModuleCache - pruneChunks (drops orphaned shared chunks)
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCache - pruneChunks', () => {
  test('removes chunks from other hashes and keeps the current one', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();
    const cacheDir = join(TEST_DIR, 'prune-chunks');
    const chunkDir = join(cacheDir, '_chunks');
    await mkdir(chunkDir, { recursive: true });
    await Bun.write(join(chunkDir, '_brika_chunk_aaa.oldhash.js'), 'old');
    await Bun.write(join(chunkDir, '_brika_chunk_bbb.newhash.js'), 'new');

    await cache.pruneChunks(cacheDir, 'newhash');

    expect(await Bun.file(join(chunkDir, '_brika_chunk_aaa.oldhash.js')).exists()).toBe(false);
    expect(await Bun.file(join(chunkDir, '_brika_chunk_bbb.newhash.js')).exists()).toBe(true);
  });

  test('is a no-op when no chunk directory exists', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();
    await expect(cache.pruneChunks(join(TEST_DIR, 'no-chunks'), 'h')).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hashPluginSources (from @brika/compiler)
// ─────────────────────────────────────────────────────────────────────────────

describe('hashPluginSources', () => {
  test('returns a consistent hex hash for given plugin root', async () => {
    const { hashPluginSources } = await import('@brika/compiler');

    const pluginRoot = join(TEST_DIR, 'hash-plugin');
    await mkdir(join(pluginRoot, 'src'), { recursive: true });
    await Bun.write(join(pluginRoot, 'src', 'index.ts'), 'export const x = 42;');

    const hash1 = await hashPluginSources(pluginRoot);
    const hash2 = await hashPluginSources(pluginRoot);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
    expect(hash1).toMatch(/^[0-9a-f]+$/);
  });

  test('returns different hash when source changes', async () => {
    const { hashPluginSources } = await import('@brika/compiler');

    const root1 = join(TEST_DIR, 'hash-root-a');
    const root2 = join(TEST_DIR, 'hash-root-b');
    await mkdir(join(root1, 'src'), { recursive: true });
    await mkdir(join(root2, 'src'), { recursive: true });
    await Bun.write(join(root1, 'src', 'index.ts'), 'const a = 1;');
    await Bun.write(join(root2, 'src', 'index.ts'), 'const b = 2;');

    const hash1 = await hashPluginSources(root1);
    const hash2 = await hashPluginSources(root2);

    expect(hash1).not.toBe(hash2);
  });
});
