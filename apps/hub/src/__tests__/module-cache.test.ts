/**
 * Tests for ModuleCache — in-memory map operations (getJs, getCss, set, remove)
 * and the etag helper function.
 *
 * Disk operations (loadFromDisk, writeToDisk) are not tested here because they
 * require real filesystem I/O. This file focuses on pure in-memory logic.
 */

import { describe, expect, test } from 'bun:test';
import { ModuleCache } from '@/runtime/modules/module-cache';

// ─── In-memory cache operations ──────────────────────────────────────────────

describe('ModuleCache - set and getJs', () => {
  test('returns undefined for unknown key', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    expect(cache.getJs('unknown:key')).toBeUndefined();
  });

  test('stores and retrieves JS entry', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:module', 'console.log("hello")');

    const entry = cache.getJs('plugin:module');
    expect(entry).toBeDefined();
    expect(entry?.content).toBe('console.log("hello")');
  });

  test('generates an etag for JS content', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:module', 'const x = 1;');

    const entry = cache.getJs('plugin:module');
    expect(entry?.etag).toBeDefined();
    expect(entry?.etag).toMatch(/^"[0-9a-z]+"$/);
  });

  test('different content produces different etags', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:a', 'const a = 1;');
    cache.set('plugin:b', 'const b = 2;');

    const etagA = cache.getJs('plugin:a')?.etag;
    const etagB = cache.getJs('plugin:b')?.etag;

    expect(etagA).not.toBe(etagB);
  });

  test('same content produces same etag', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    const content = 'export default function() {}';
    cache.set('plugin:a', content);
    cache.set('plugin:b', content);

    expect(cache.getJs('plugin:a')?.etag).toBe(cache.getJs('plugin:b')?.etag);
  });

  test('overwrites existing entry with set()', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:module', 'const old = true;');
    cache.set('plugin:module', 'const new_ = true;');

    expect(cache.getJs('plugin:module')?.content).toBe('const new_ = true;');
  });
});

describe('ModuleCache - set and getCss', () => {
  test('returns undefined when no CSS was stored', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:module', 'js content');

    expect(cache.getCss('plugin:module')).toBeUndefined();
  });

  test('returns undefined for unknown key', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    expect(cache.getCss('unknown:key')).toBeUndefined();
  });

  test('stores and retrieves CSS entry when provided', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:module', 'js content', '.container { display: flex; }');

    const css = cache.getCss('plugin:module');
    expect(css).toBeDefined();
    expect(css?.content).toBe('.container { display: flex; }');
  });

  test('generates an etag for CSS content', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:module', 'js', '.foo { color: red; }');

    const css = cache.getCss('plugin:module');
    expect(css?.etag).toBeDefined();
    expect(css?.etag).toMatch(/^"[0-9a-z]+"$/);
  });

  test('CSS etag differs from JS etag when content differs', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:module', 'js content', 'css content');

    const jsEtag = cache.getJs('plugin:module')?.etag;
    const cssEtag = cache.getCss('plugin:module')?.etag;

    expect(jsEtag).not.toBe(cssEtag);
  });

  test('overwriting with no CSS clears previous CSS', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:module', 'js', '.foo {}');
    expect(cache.getCss('plugin:module')).toBeDefined();

    cache.set('plugin:module', 'js updated');
    expect(cache.getCss('plugin:module')).toBeUndefined();
  });
});

describe('ModuleCache - remove', () => {
  test('removes all entries for a plugin prefix', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('my-plugin:page1', 'js1', 'css1');
    cache.set('my-plugin:page2', 'js2');
    cache.set('other-plugin:page1', 'js3');

    cache.remove('my-plugin');

    expect(cache.getJs('my-plugin:page1')).toBeUndefined();
    expect(cache.getJs('my-plugin:page2')).toBeUndefined();
    expect(cache.getCss('my-plugin:page1')).toBeUndefined();
  });

  test('does not affect entries from other plugins', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin-a:module', 'js-a');
    cache.set('plugin-b:module', 'js-b');

    cache.remove('plugin-a');

    expect(cache.getJs('plugin-a:module')).toBeUndefined();
    expect(cache.getJs('plugin-b:module')?.content).toBe('js-b');
  });

  test('handles removing a plugin with no cached entries', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    // Should not throw
    cache.remove('nonexistent-plugin');
  });

  test('removes entries even when plugin name is a prefix of another', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('timer:page', 'js1');
    cache.set('timer-pro:page', 'js2');

    cache.remove('timer');

    // "timer:" entries removed, but "timer-pro:" entries should remain
    expect(cache.getJs('timer:page')).toBeUndefined();
    expect(cache.getJs('timer-pro:page')?.content).toBe('js2');
  });

  test('can re-add entries after remove', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:module', 'js-old');
    cache.remove('plugin');

    expect(cache.getJs('plugin:module')).toBeUndefined();

    cache.set('plugin:module', 'js-new');
    expect(cache.getJs('plugin:module')?.content).toBe('js-new');
  });
});

describe('ModuleCache - multiple modules per plugin', () => {
  test('stores multiple modules independently', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:settings', 'settings js', 'settings css');
    cache.set('plugin:dashboard', 'dashboard js', 'dashboard css');

    expect(cache.getJs('plugin:settings')?.content).toBe('settings js');
    expect(cache.getJs('plugin:dashboard')?.content).toBe('dashboard js');
    expect(cache.getCss('plugin:settings')?.content).toBe('settings css');
    expect(cache.getCss('plugin:dashboard')?.content).toBe('dashboard css');
  });

  test('updating one module does not affect another', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:a', 'js-a');
    cache.set('plugin:b', 'js-b');

    cache.set('plugin:a', 'js-a-updated');

    expect(cache.getJs('plugin:a')?.content).toBe('js-a-updated');
    expect(cache.getJs('plugin:b')?.content).toBe('js-b');
  });
});

describe('ModuleCache - edge cases', () => {
  test('handles empty string JS content', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:empty', '');

    expect(cache.getJs('plugin:empty')?.content).toBe('');
    expect(cache.getJs('plugin:empty')?.etag).toBeDefined();
  });

  test('empty string CSS is treated as no CSS (falsy)', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('plugin:empty-css', 'js content', '');

    // Empty string is falsy, so CSS is not stored
    expect(cache.getCss('plugin:empty-css')).toBeUndefined();
  });

  test('handles scoped package names in keys', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('@brika/weather:settings', 'scoped js');

    expect(cache.getJs('@brika/weather:settings')?.content).toBe('scoped js');
  });

  test('remove works with scoped package names', () => {
    const cache = new ModuleCache('/tmp/test-cache');
    cache.set('@brika/weather:settings', 'js1');
    cache.set('@brika/weather:dashboard', 'js2');
    cache.set('@brika/timer:settings', 'js3');

    cache.remove('@brika/weather');

    expect(cache.getJs('@brika/weather:settings')).toBeUndefined();
    expect(cache.getJs('@brika/weather:dashboard')).toBeUndefined();
    expect(cache.getJs('@brika/timer:settings')?.content).toBe('js3');
  });
});
