/**
 * Tests for the template unpacking that {@link BrikaInitializer.init}
 * delegates to. The initializer itself is now a thin wrapper around
 * `brikaContext` paths and `unpackTemplates` — independently testing
 * its `brikaDir`/`rootDir` getters is just re-asserting context shape
 * (covered in `runtime/context/__tests__/brika-context.test.ts`).
 *
 * These tests target `unpackTemplates` against a tmp dir so the real
 * `${brikaContext.brikaDir}` isn't polluted.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTarBytes } from '@brika/db/macros' with { type: 'macro' };
import { unpackTemplates } from '@/runtime/config/templates-tar';
import type { Logger } from '@/runtime/logs/log-router';

function silentLogger(): Logger {
  const noop = () => {};
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    withSource: () => silentLogger(),
  } as unknown as Logger;
}

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'brika-init-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function unpackInto(rootDir: string): Promise<void> {
  const archive = new Uint8Array(await loadTarBytes('apps/hub/src/templates'));
  await unpackTemplates(archive, rootDir, silentLogger());
}

describe('unpackTemplates (BrikaInitializer.init internals)', () => {
  test('unpacks templates into `${rootDir}/.brika/`', async () => {
    await withTmpDir(async (dir) => {
      await unpackInto(dir);
      const files = await readdir(join(dir, '.brika'));
      expect(files).toContain('brika.yml');
      expect(files).toContain('workflows');
    });
  });

  test('default brika.yml carries the expected sections', async () => {
    await withTmpDir(async (dir) => {
      await unpackInto(dir);
      const content = await readFile(join(dir, '.brika', 'brika.yml'), 'utf8');
      expect(content).toContain('hub:');
      expect(content).toContain('port: 3001');
      expect(content).toContain('plugins:');
      expect(content).toContain('@brika/plugin-builtin');
      expect(content).toContain('rules: []');
      expect(content).toContain('schedules: []');
    });
  });

  test('does not overwrite an existing brika.yml', async () => {
    await withTmpDir(async (dir) => {
      await unpackInto(dir);
      const configPath = join(dir, '.brika', 'brika.yml');
      const customContent = '# Custom config\nhub:\n  port: 9999\n';
      await Bun.write(configPath, customContent);
      await unpackInto(dir);
      const content = await readFile(configPath, 'utf8');
      expect(content).toBe(customContent);
    });
  });

  test('creates the workflows subdirectory', async () => {
    await withTmpDir(async (dir) => {
      await unpackInto(dir);
      const files = await readdir(join(dir, '.brika', 'workflows'));
      expect(Array.isArray(files)).toBe(true);
    });
  });
});
