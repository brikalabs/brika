/**
 * Unit tests for `buildBunFileProxy`. Drives the proxy against a
 * mocked `globalThis.__brika_fs` so we don't need a real channel.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { buildBunFileProxy } from '../bun-file-proxy';
import type { BrikaFsRuntime } from '../fs-runtime';

const mockRuntime: BrikaFsRuntime = {
  readFile: async ({ encoding }) => {
    if (encoding === 'utf-8') {
      return { encoding: 'utf-8', content: '{"hello":"world"}' };
    }
    return { encoding: 'binary', content: new TextEncoder().encode('binary') };
  },
  writeFile: async () => ({ bytesWritten: 0 }),
  readdir: async () => ({ entries: [] }),
  stat: async () => ({
    size: 0,
    mtimeMs: 0,
    isFile: true,
    isDirectory: false,
    isSymlink: false,
  }),
  mkdir: async () => ({ created: false }),
  rm: async () => ({ removed: false }),
  exists: async ({ path }) => ({ exists: path !== '/data/missing' }),
};

beforeEach(() => {
  globalThis.__brika_fs = mockRuntime;
});

afterEach(() => {
  globalThis.__brika_fs = undefined;
});

describe('buildBunFileProxy', () => {
  test('text() returns the utf-8 content', async () => {
    const factory = buildBunFileProxy();
    const f = factory('/data/x.json');
    expect(await f.text()).toBe('{"hello":"world"}');
  });

  test('bytes() returns a Uint8Array', async () => {
    const factory = buildBunFileProxy();
    const f = factory('/data/x.bin');
    const out = await f.bytes();
    expect(out).toBeInstanceOf(Uint8Array);
  });

  test('arrayBuffer() returns a fresh ArrayBuffer (not the underlying buffer)', async () => {
    const factory = buildBunFileProxy();
    const f = factory('/data/x.bin');
    const ab = await f.arrayBuffer();
    expect(ab).toBeInstanceOf(ArrayBuffer);
    // Length should match the binary content from the mock.
    expect(ab.byteLength).toBe('binary'.length);
  });

  test('json() parses the utf-8 content', async () => {
    const factory = buildBunFileProxy();
    const f = factory('/data/x.json');
    expect(await f.json()).toEqual({ hello: 'world' });
  });

  test('exists() returns true / false based on runtime probe', async () => {
    const factory = buildBunFileProxy();
    expect(await factory('/data/x').exists()).toBe(true);
    expect(await factory('/data/missing').exists()).toBe(false);
  });

  test('name is the original path', () => {
    const factory = buildBunFileProxy();
    expect(factory('/data/x').name).toBe('/data/x');
  });

  test('throws a clear error when the runtime is not installed', async () => {
    globalThis.__brika_fs = undefined;
    const factory = buildBunFileProxy();
    await expect(factory('/data/x').text()).rejects.toThrow(
      /Bun\.file: the Brika prelude has not installed/
    );
  });
});
