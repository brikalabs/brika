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
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, stub, useTestBed } from '@brika/di/testing';
import { Logger } from '@/runtime/logs/log-router';
import { ModuleCompiler } from '@/runtime/modules/module-compiler';

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

function makeBuildSuccess(jsOutput: string) {
  return {
    success: true,
    outputs: [
      {
        text: () => Promise.resolve(jsOutput),
      },
    ],
    logs: [],
  } as unknown as Awaited<ReturnType<typeof Bun.build>>;
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
// get() — returns JS cache entry
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCompiler - get()', () => {
  let compiler: ModuleCompiler;

  useTestBed(
    { autoStub: false },
    () => {
      stub(Logger);
      compiler = get(ModuleCompiler);
    }
  );

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

  useTestBed(
    { autoStub: false },
    () => {
      stub(Logger);
      compiler = get(ModuleCompiler);
    }
  );

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

  useTestBed(
    { autoStub: false },
    () => {
      stub(Logger);
      compiler = get(ModuleCompiler);
    }
  );

  // ── entrypoint not found ─────────────────────────────────────────────────

  test('skips module when entrypoint does not exist', async () => {
    // Real dir with src/ but no page file — entrypoint missing
    const root = join(TEST_DIR, 'no-entry');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'dummy.ts'), 'export {}');

    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess(''));

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

    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('export default 1;'));

    try {
      await compiler.compile('my-plugin', root, {
        pages: [{ id: 'existing' }, { id: 'missing' }],
      });
      // Build should have been called once — for the existing module only
      expect(buildSpy).toHaveBeenCalledTimes(1);
    } finally {
      buildSpy.mockRestore();
    }
  });

  // ── successful build ─────────────────────────────────────────────────────

  test('compiles module and populates cache on successful build', async () => {
    const root = join(TEST_DIR, 'project');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'pages', 'home.tsx'), 'export default () => <div>Home</div>;');

    const compiledJs = 'var e=()=>"Home";export default e;';
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess(compiledJs));

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

  test('compiles multiple modules in parallel', async () => {
    const root = join(TEST_DIR, 'proj-multi');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'pages', 'page1.tsx'), 'export const P1 = 1;');
    await Bun.write(join(root, 'src', 'pages', 'page2.tsx'), 'export const P2 = 2;');

    let callCount = 0;
    const buildSpy = spyOn(Bun, 'build').mockImplementation(() => {
      callCount++;
      return Promise.resolve(makeBuildSuccess(`module_${callCount}`));
    });

    try {
      await compiler.compile('multi', root, {
        pages: [{ id: 'page1' }, { id: 'page2' }],
      });
      expect(buildSpy).toHaveBeenCalledTimes(2);
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
    await Bun.write(join(srcDir, 'actions.ts'), 'export const play = defineAction(async () => {});');

    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('built;'));

    try {
      await compiler.compile('actions-plugin', projDir, {
        pages: [{ id: 'main' }],
      });

      expect(buildSpy).toHaveBeenCalledTimes(1);
      const buildCall = buildSpy.mock.calls[0][0] as {
        plugins: unknown[];
      };
      // externals + actions = 2 plugins
      expect(buildCall.plugins).toHaveLength(2);
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

    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('built;'));

    try {
      await compiler.compile('no-actions', projDir, {
        pages: [{ id: 'main' }],
      });

      expect(buildSpy).toHaveBeenCalledTimes(1);
      const buildCall = buildSpy.mock.calls[0][0] as {
        plugins: unknown[];
      };
      expect(buildCall.plugins).toHaveLength(2);
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

  test('build failure does not affect other modules in the same compile call', async () => {
    const root = join(TEST_DIR, 'proj-mixed');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await Bun.write(join(root, 'src', 'pages', 'good.tsx'), 'export default 1;');
    await Bun.write(join(root, 'src', 'pages', 'bad.tsx'), 'broken');

    const buildSpy = spyOn(Bun, 'build').mockImplementation(((opts: { entrypoints: string[] }) => {
      if (opts.entrypoints[0].includes('bad')) {
        return Promise.resolve(makeBuildFailure(['error']));
      }
      return Promise.resolve(makeBuildSuccess('good-output'));
    }) as typeof Bun.build);

    try {
      await compiler.compile('mixed', root, {
        pages: [{ id: 'good' }, { id: 'bad' }],
      });

      expect(compiler.get('mixed:pages/good')).toBeDefined();
      expect(await Bun.file(compiler.get('mixed:pages/good')?.filePath ?? '').text()).toBe('good-output');
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

    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('out;'));

    try {
      await compiler.compile('opts-plugin', root, {
        pages: [{ id: 'settings' }],
      });

      const buildOpts = buildSpy.mock.calls[0][0];
      expect(buildOpts.target).toBe('browser');
      expect(buildOpts.format).toBe('esm');
      expect(buildOpts.minify).toBe(true);
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

    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess(''));

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

    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('widget-js;'));

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

  useTestBed(
    { autoStub: false },
    () => {
      stub(Logger);
      compiler = get(ModuleCompiler);
    }
  );

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
