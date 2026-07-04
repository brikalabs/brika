import { describe, expect, test } from 'bun:test';
import * as barrel from './index';
import * as bun from './route-bun';
import * as v8 from './route-v8';

describe('@brika/compiler/v8 route', () => {
  test('createCompiler is the isolate backend', () => {
    const compiler = v8.createCompiler();
    expect(compiler.backend).toBe('isolate');
    expect(typeof compiler.version).toBe('string');
  });

  test('bundling no entrypoints succeeds with empty output', async () => {
    const result = await v8.createCompiler().bundle({
      entrypoints: [],
      pluginRoot: '/plugin',
      readFile: () => Promise.resolve(''),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.entries).toEqual([]);
      expect(result.chunks).toEqual([]);
    }
  });

  test('re-exports the gate + report + stamp API as callables', () => {
    for (const name of [
      'compilePluginGate',
      'buildReport',
      'readManifest',
      'scanActions',
      'stamp',
      'readStamp',
    ] as const) {
      expect(typeof v8[name]).toBe('function');
    }
  });
});

describe('@brika/compiler/bun route', () => {
  test('createCompiler is the bun backend', () => {
    const compiler = bun.createCompiler();
    expect(compiler.backend).toBe('bun');
    expect(typeof compiler.version).toBe('string');
  });

  test('BunBundler fails fast on in-memory readFile (it reads the disk)', async () => {
    const result = await bun.createCompiler().bundle({
      entrypoints: ['/plugin/src/bricks/a.tsx'],
      pluginRoot: '/plugin',
      readFile: () => Promise.resolve('export const A = 1;'),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.backend).toBe('bun');
      expect(result.errors[0]).toContain('readFile');
    }
  });

  test('exposes the same swappable API surface as /v8', () => {
    for (const name of ['createCompiler', 'compilePluginGate', 'scanActions', 'stamp'] as const) {
      expect(typeof bun[name]).toBe('function');
    }
  });
});

test('the main bundle barrel re-exports BunBundler + stamp helpers', () => {
  expect(typeof barrel.BunBundler).toBe('function');
  expect(typeof barrel.stamp).toBe('function');
  expect(typeof barrel.readStamp).toBe('function');
});
