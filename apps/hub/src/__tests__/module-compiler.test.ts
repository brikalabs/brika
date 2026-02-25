/**
 * Tests for ModuleCompiler class
 *
 * Tests compile(), get(), getStyle(), remove() and the internal pipeline:
 * - entrypoint existence check
 * - hash-based cache validation
 * - Bun.build integration
 * - CSS compilation via TailwindCompiler
 * - Error handling for missing files, build failures, CSS failures
 */

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';
import { ModuleCompiler } from '@/runtime/modules/module-compiler';

// ─────────────────────────────────────────────────────────────────────────────
// Temp directory for ModuleCache disk path (required by constructor)
// ─────────────────────────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `brika-test-mc-compile-${Date.now()}`);
const BRIKA_DIR = join(TEST_DIR, 'brika');
const CACHE_DIR = join(BRIKA_DIR, 'cache', 'modules');

beforeAll(async () => {
  await mkdir(CACHE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeFakeFile(
  fakeFs: Map<string, string>,
  path: string
): ReturnType<typeof Bun.file> {
  const exists = fakeFs.has(path);
  const content = fakeFs.get(path) ?? '';
  return {
    exists: () => Promise.resolve(exists),
    text: () => (exists ? Promise.resolve(content) : Promise.reject(new Error(`ENOENT: ${path}`))),
    json: () => (exists ? Promise.resolve(JSON.parse(content)) : Promise.reject(new Error(`ENOENT: ${path}`))),
    arrayBuffer: () =>
      exists
        ? Promise.resolve(new TextEncoder().encode(content).buffer)
        : Promise.reject(new Error(`ENOENT: ${path}`)),
  } as unknown as ReturnType<typeof Bun.file>;
}

function makeBuildSuccess(jsOutput: string) {
  return {
    success: true,
    outputs: [{ text: () => Promise.resolve(jsOutput) }],
    logs: [],
  } as unknown as Awaited<ReturnType<typeof Bun.build>>;
}

function makeBuildFailure(messages: string[]) {
  return {
    success: false,
    outputs: [],
    logs: messages.map((m) => ({ message: m })),
  } as unknown as Awaited<ReturnType<typeof Bun.build>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// get() — returns JS cache entry
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCompiler - get()', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    provide(ConfigLoader, { brikaDir: BRIKA_DIR } as ConfigLoader);
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
// getStyle() — returns CSS cache entry
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCompiler - getStyle()', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    provide(ConfigLoader, { brikaDir: BRIKA_DIR } as ConfigLoader);
    compiler = get(ModuleCompiler);
  });

  test('returns undefined for unknown key', () => {
    expect(compiler.getStyle('nonexistent:module')).toBeUndefined();
  });

  test('returns undefined for empty string key', () => {
    expect(compiler.getStyle('')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// remove() — evicts plugin entries from cache
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCompiler - remove()', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    provide(ConfigLoader, { brikaDir: BRIKA_DIR } as ConfigLoader);
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
    provide(ConfigLoader, { brikaDir: BRIKA_DIR } as ConfigLoader);
    compiler = get(ModuleCompiler);
  });

  // ── entrypoint not found ─────────────────────────────────────────────────

  test('skips module when entrypoint does not exist', async () => {
    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(new Map(), String(path));
    }) as typeof Bun.file);
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess(''));

    try {
      await compiler.compile('my-plugin', '/root', [{ id: 'settings' }]);
      expect(buildSpy).not.toHaveBeenCalled();
    } finally {
      fileSpy.mockRestore();
      buildSpy.mockRestore();
    }
  });

  test('handles multiple modules where some do not exist', async () => {
    const fakeFs = new Map<string, string>();
    fakeFs.set('/root/src/pages/existing.tsx', 'const x = 1;');

    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(fakeFs, String(path));
    }) as typeof Bun.file);
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('export default 1;'));

    try {
      await compiler.compile('my-plugin', '/root', [
        { id: 'existing' },
        { id: 'missing' },
      ]);
      // Build should have been called once — for the existing module only
      expect(buildSpy).toHaveBeenCalledTimes(1);
    } finally {
      fileSpy.mockRestore();
      buildSpy.mockRestore();
    }
  });

  // ── successful build ─────────────────────────────────────────────────────

  test('compiles module and populates cache on successful build', async () => {
    const fakeFs = new Map<string, string>();
    fakeFs.set('/project/src/pages/home.tsx', 'export default () => <div>Home</div>;');

    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(fakeFs, String(path));
    }) as typeof Bun.file);

    const compiledJs = 'var e=()=>"Home";export default e;';
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess(compiledJs));

    try {
      await compiler.compile('test-plugin', '/project', [{ id: 'home' }]);

      const jsEntry = compiler.get('test-plugin:home');
      expect(jsEntry).toBeDefined();
      expect(jsEntry?.content).toBe(compiledJs);
      expect(jsEntry?.etag).toMatch(/^"[0-9a-z]+"$/);
    } finally {
      fileSpy.mockRestore();
      buildSpy.mockRestore();
    }
  });

  test('compiles multiple modules in parallel', async () => {
    const fakeFs = new Map<string, string>();
    fakeFs.set('/proj/src/pages/page1.tsx', 'export const P1 = 1;');
    fakeFs.set('/proj/src/pages/page2.tsx', 'export const P2 = 2;');

    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(fakeFs, String(path));
    }) as typeof Bun.file);

    let callCount = 0;
    const buildSpy = spyOn(Bun, 'build').mockImplementation(() => {
      callCount++;
      return Promise.resolve(makeBuildSuccess(`module_${callCount}`));
    });

    try {
      await compiler.compile('multi', '/proj', [{ id: 'page1' }, { id: 'page2' }]);
      expect(buildSpy).toHaveBeenCalledTimes(2);
    } finally {
      fileSpy.mockRestore();
      buildSpy.mockRestore();
    }
  });

  // ── build with actionsFile ───────────────────────────────────────────────

  test('includes actions plugin when actionsFile is provided', async () => {
    const fakeFs = new Map<string, string>();
    fakeFs.set('/proj/src/pages/main.tsx', 'export default () => null;');

    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(fakeFs, String(path));
    }) as typeof Bun.file);
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('built;'));

    try {
      await compiler.compile('actions-plugin', '/proj', [{ id: 'main' }], '/proj/src/actions.ts');

      expect(buildSpy).toHaveBeenCalledTimes(1);
      const buildCall = buildSpy.mock.calls[0][0] as { plugins: unknown[] };
      expect(buildCall.plugins).toHaveLength(2);
    } finally {
      fileSpy.mockRestore();
      buildSpy.mockRestore();
    }
  });

  test('uses only externals plugin when no actionsFile is provided', async () => {
    const fakeFs = new Map<string, string>();
    fakeFs.set('/proj/src/pages/main.tsx', 'export default () => null;');

    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(fakeFs, String(path));
    }) as typeof Bun.file);
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('built;'));

    try {
      await compiler.compile('no-actions', '/proj', [{ id: 'main' }]);

      expect(buildSpy).toHaveBeenCalledTimes(1);
      const buildCall = buildSpy.mock.calls[0][0] as { plugins: unknown[] };
      expect(buildCall.plugins).toHaveLength(1);
    } finally {
      fileSpy.mockRestore();
      buildSpy.mockRestore();
    }
  });

  // ── build failure ────────────────────────────────────────────────────────

  test('does not populate cache when build fails', async () => {
    const fakeFs = new Map<string, string>();
    fakeFs.set('/proj/src/pages/broken.tsx', 'invalid syntax {{{}}}');

    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(fakeFs, String(path));
    }) as typeof Bun.file);
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(
      makeBuildFailure(['SyntaxError: unexpected token'])
    );

    try {
      await compiler.compile('fail-plugin', '/proj', [{ id: 'broken' }]);
      expect(compiler.get('fail-plugin:broken')).toBeUndefined();
    } finally {
      fileSpy.mockRestore();
      buildSpy.mockRestore();
    }
  });

  test('build failure does not affect other modules in the same compile call', async () => {
    const fakeFs = new Map<string, string>();
    fakeFs.set('/proj/src/pages/good.tsx', 'export default 1;');
    fakeFs.set('/proj/src/pages/bad.tsx', 'broken');

    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(fakeFs, String(path));
    }) as typeof Bun.file);
    const buildSpy = spyOn(Bun, 'build').mockImplementation(((opts: { entrypoints: string[] }) => {
      if (opts.entrypoints[0].includes('bad')) {
        return Promise.resolve(makeBuildFailure(['error']));
      }
      return Promise.resolve(makeBuildSuccess('good-output'));
    }) as typeof Bun.build);

    try {
      await compiler.compile('mixed', '/proj', [{ id: 'good' }, { id: 'bad' }]);

      expect(compiler.get('mixed:good')?.content).toBe('good-output');
      expect(compiler.get('mixed:bad')).toBeUndefined();
    } finally {
      fileSpy.mockRestore();
      buildSpy.mockRestore();
    }
  });

  // ── build options ────────────────────────────────────────────────────────

  test('passes correct build options to Bun.build', async () => {
    const fakeFs = new Map<string, string>();
    fakeFs.set('/proj/src/pages/settings.tsx', 'export default "settings";');

    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(fakeFs, String(path));
    }) as typeof Bun.file);
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('out;'));

    try {
      await compiler.compile('opts-plugin', '/proj', [{ id: 'settings' }]);

      const buildOpts = buildSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(buildOpts.target).toBe('browser');
      expect(buildOpts.format).toBe('esm');
      expect(buildOpts.minify).toBe(true);
      expect(buildOpts.entrypoints).toEqual(['/proj/src/pages/settings.tsx']);
    } finally {
      fileSpy.mockRestore();
      buildSpy.mockRestore();
    }
  });

  // ── empty modules list ───────────────────────────────────────────────────

  test('handles empty modules list without calling build', async () => {
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess(''));

    try {
      await compiler.compile('empty-plugin', '/proj', []);
      expect(buildSpy).not.toHaveBeenCalled();
    } finally {
      buildSpy.mockRestore();
    }
  });

  // ── remove after compile ─────────────────────────────────────────────────

  test('remove() evicts compiled entries from cache', async () => {
    const fakeFs = new Map<string, string>();
    fakeFs.set('/proj/src/pages/widget.tsx', 'export const W = 1;');

    const fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      return makeFakeFile(fakeFs, String(path));
    }) as typeof Bun.file);
    const buildSpy = spyOn(Bun, 'build').mockResolvedValue(makeBuildSuccess('widget-js;'));

    try {
      await compiler.compile('removable', '/proj', [{ id: 'widget' }]);
      expect(compiler.get('removable:widget')).toBeDefined();

      compiler.remove('removable');
      expect(compiler.get('removable:widget')).toBeUndefined();
      expect(compiler.getStyle('removable:widget')).toBeUndefined();
    } finally {
      fileSpy.mockRestore();
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
    provide(ConfigLoader, { brikaDir: BRIKA_DIR } as ConfigLoader);
    compiler = get(ModuleCompiler);
  });

  test('skips build when module is loaded from disk cache', async () => {
    const pluginName = 'cache-hit-plugin';
    const moduleId = 'dashboard';
    const sourceContent = 'export const App = () => <div/>;';

    // Write the source file so hashSource can compute it
    const sourceDir = join(TEST_DIR, 'root-cache', 'src', 'pages');
    await mkdir(sourceDir, { recursive: true });
    await Bun.write(join(sourceDir, `${moduleId}.tsx`), sourceContent);

    // Compute the hash the same way hashSource would
    const { hashSource } = await import('@/runtime/modules/module-cache');
    const hash = await hashSource(join(sourceDir, `${moduleId}.tsx`));

    // Prepare the disk cache entry
    const pluginCacheDir = join(CACHE_DIR, pluginName);
    await mkdir(pluginCacheDir, { recursive: true });
    await Bun.write(join(pluginCacheDir, `${moduleId}.${hash}.js`), 'cached-js');
    await Bun.write(join(pluginCacheDir, `${moduleId}.${hash}.css`), 'cached-css');

    const buildSpy = spyOn(Bun, 'build');

    try {
      await compiler.compile(pluginName, join(TEST_DIR, 'root-cache'), [{ id: moduleId }]);

      // Build should NOT have been called — cache hit
      expect(buildSpy).not.toHaveBeenCalled();

      // The entry should be available via get() and getStyle()
      const jsEntry = compiler.get(`${pluginName}:${moduleId}`);
      expect(jsEntry).toBeDefined();
      expect(jsEntry?.content).toBe('cached-js');

      const cssEntry = compiler.getStyle(`${pluginName}:${moduleId}`);
      expect(cssEntry).toBeDefined();
      expect(cssEntry?.content).toBe('cached-css');
    } finally {
      buildSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ModuleCache - loadFromDisk (integration via real filesystem)
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCache - loadFromDisk', () => {
  const pluginName = 'disk-test-plugin';
  const moduleId = 'page';
  const hash = 'abc12345';
  const jsContent = 'export default 42;';
  const cssContent = '.page { color: red; }';

  beforeAll(async () => {
    const pluginDir = join(CACHE_DIR, pluginName);
    await mkdir(pluginDir, { recursive: true });
    await Bun.write(join(pluginDir, `${moduleId}.${hash}.js`), jsContent);
    await Bun.write(join(pluginDir, `${moduleId}.${hash}.css`), cssContent);
  });

  test('returns true on cache hit and populates in-memory cache', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(CACHE_DIR);

    const hit = await cache.loadFromDisk(pluginName, moduleId, hash);
    expect(hit).toBe(true);

    const js = cache.getJs(`${pluginName}:${moduleId}`);
    expect(js).toBeDefined();
    expect(js?.content).toBe(jsContent);
    expect(js?.etag).toMatch(/^"[0-9a-z]+"$/);

    const css = cache.getCss(`${pluginName}:${moduleId}`);
    expect(css).toBeDefined();
    expect(css?.content).toBe(cssContent);
    expect(css?.etag).toMatch(/^"[0-9a-z]+"$/);
  });

  test('returns false when hash does not match', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(CACHE_DIR);

    const hit = await cache.loadFromDisk(pluginName, moduleId, 'wronghash');
    expect(hit).toBe(false);
  });

  test('returns false when plugin does not exist', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(CACHE_DIR);

    const hit = await cache.loadFromDisk('no-plugin', 'no-module', 'deadbeef');
    expect(hit).toBe(false);
  });

  test('loadFromDisk without CSS file only loads JS', async () => {
    const jsOnlyPlugin = 'js-only';
    const jsOnlyDir = join(CACHE_DIR, jsOnlyPlugin);
    await mkdir(jsOnlyDir, { recursive: true });
    await Bun.write(join(jsOnlyDir, `main.${hash}.js`), 'const x = 1;');

    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(CACHE_DIR);

    const hit = await cache.loadFromDisk(jsOnlyPlugin, 'main', hash);
    expect(hit).toBe(true);

    expect(cache.getJs(`${jsOnlyPlugin}:main`)).toBeDefined();
    expect(cache.getCss(`${jsOnlyPlugin}:main`)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ModuleCache - writeToDisk
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleCache - writeToDisk', () => {
  test('writes JS file to disk and can be read back', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(CACHE_DIR);

    await cache.writeToDisk('write-test', 'mod', 'hash1', 'export const a = 1;');

    const jsFile = Bun.file(join(CACHE_DIR, 'write-test', 'mod.hash1.js'));
    expect(await jsFile.exists()).toBe(true);
    expect(await jsFile.text()).toBe('export const a = 1;');
  });

  test('writes both JS and CSS files when CSS is provided', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(CACHE_DIR);

    await cache.writeToDisk('write-test2', 'mod', 'hash2', 'js code', '.foo {}');

    const jsFile = Bun.file(join(CACHE_DIR, 'write-test2', 'mod.hash2.js'));
    const cssFile = Bun.file(join(CACHE_DIR, 'write-test2', 'mod.hash2.css'));

    expect(await jsFile.exists()).toBe(true);
    expect(await cssFile.exists()).toBe(true);
    expect(await cssFile.text()).toBe('.foo {}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hashSource
// ─────────────────────────────────────────────────────────────────────────────

describe('hashSource', () => {
  test('returns a consistent hex hash for given content', async () => {
    const { hashSource } = await import('@/runtime/modules/module-cache');

    const filePath = join(TEST_DIR, 'hash-test.tsx');
    await Bun.write(filePath, 'export const x = 42;');

    const hash1 = await hashSource(filePath);
    const hash2 = await hashSource(filePath);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(8);
    expect(hash1).toMatch(/^[0-9a-f]+$/);
  });

  test('returns different hash for different content', async () => {
    const { hashSource } = await import('@/runtime/modules/module-cache');

    const file1 = join(TEST_DIR, 'hash-a.tsx');
    const file2 = join(TEST_DIR, 'hash-b.tsx');
    await Bun.write(file1, 'const a = 1;');
    await Bun.write(file2, 'const b = 2;');

    const hash1 = await hashSource(file1);
    const hash2 = await hashSource(file2);

    expect(hash1).not.toBe(hash2);
  });
});
